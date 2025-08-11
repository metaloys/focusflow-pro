import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  runApp(const FocusKitApp());
}

class FocusKitApp extends StatelessWidget {
  const FocusKitApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()..load()),
      ],
      child: Consumer<AppState>(
        builder: (context, app, _) {
          final themeMode = app.themeMode == 'dark'
              ? ThemeMode.dark
              : app.themeMode == 'light'
                  ? ThemeMode.light
                  : ThemeMode.system;
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            title: 'FocusKit',
            themeMode: themeMode,
            theme: ThemeData(
              useMaterial3: true,
              colorSchemeSeed: Colors.indigo,
              brightness: Brightness.light,
            ),
            darkTheme: ThemeData(
              useMaterial3: true,
              colorSchemeSeed: Colors.indigo,
              brightness: Brightness.dark,
            ),
            home: app.supaReady && !app.isAuthenticated
                ? const AuthPage()
                : const HomePage(),
          );
        },
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      const TimerPage(),
      const TasksPage(),
      const ReportsPage(),
      const SettingsPage(),
    ];
    return Scaffold(
      body: SafeArea(child: pages[_index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.timer), label: 'Timer'),
          NavigationDestination(icon: Icon(Icons.checklist), label: 'Tasks'),
          NavigationDestination(icon: Icon(Icons.insights), label: 'Reports'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}

class AppState extends ChangeNotifier {
  // Supabase
  bool supaReady = false;
  bool isAuthenticated = false;
  String? userId;
  RealtimeChannel? _tasksChannel;
  // Settings
  int focusMinutes = 25;
  int breakMinutes = 5;
  int longBreakMinutes = 15;
  int sessionsBeforeLong = 4;
  bool autoStartNext = true;
  String themeMode = 'system'; // system | light | dark
  // Timer
  String currentMode = 'idle'; // idle | focus | break
  DateTime? sessionEnd;
  DateTime? sessionStart;
  int completedFocusCount = 0;
  Timer? _ticker;
  // Tasks
  List<TaskItem> tasks = [];
  // Stats
  Map<String, DayStat> stats = {}; // yyyy-mm-dd -> stat
  // Blocklist (default)
  String? _defaultBlocklistId;
  List<String> blocklistDomains = [];

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    focusMinutes = prefs.getInt('focusMinutes') ?? 25;
    breakMinutes = prefs.getInt('breakMinutes') ?? 5;
    longBreakMinutes = prefs.getInt('longBreakMinutes') ?? 15;
    sessionsBeforeLong = prefs.getInt('sessionsBeforeLong') ?? 4;
    autoStartNext = prefs.getBool('autoStartNext') ?? true;
    themeMode = prefs.getString('themeMode') ?? 'system';

    tasks = (prefs.getStringList('tasks') ?? [])
        .map((s) => TaskItem.fromJson(jsonDecode(s) as Map<String, dynamic>))
        .toList();

    final statsRaw = prefs.getString('stats');
    if (statsRaw != null) {
      final map = jsonDecode(statsRaw) as Map<String, dynamic>;
      stats = map.map((k, v) => MapEntry(k, DayStat.fromJson(v as Map<String, dynamic>)));
    }

    await _initSupabase();
    await _refreshAuthState();
    if (isAuthenticated) {
      await loadFromSupabase();
      await _subscribeTasksRealtime();
      await refreshRemoteStats(days: 7);
      await loadBlocklistFromSupabase();
    }
    _startTicker();
    notifyListeners();
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('focusMinutes', focusMinutes);
    await prefs.setInt('breakMinutes', breakMinutes);
    await prefs.setInt('longBreakMinutes', longBreakMinutes);
    await prefs.setInt('sessionsBeforeLong', sessionsBeforeLong);
    await prefs.setBool('autoStartNext', autoStartNext);
    await prefs.setString('themeMode', themeMode);
    await prefs.setStringList('tasks', tasks.map((t) => jsonEncode(t.toJson())).toList());
    await prefs.setString('stats', jsonEncode(stats.map((k, v) => MapEntry(k, v.toJson()))));
    if (isAuthenticated) {
      await _upsertSettingsRemote();
    }
  }

  void _startTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (sessionEnd != null && DateTime.now().isAfter(sessionEnd!)) {
        _onAlarm();
      }
      notifyListeners();
    });
  }

  String todayKey() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  void _addStat({int sessions = 0, int focusSeconds = 0, int tasksDone = 0}) {
    final key = todayKey();
    final day = stats[key] ?? DayStat(sessions: 0, focusSeconds: 0, tasksDone: 0);
    stats[key] = DayStat(
      sessions: (day.sessions + sessions).clamp(0, 1 << 31),
      focusSeconds: (day.focusSeconds + focusSeconds).clamp(0, 1 << 31),
      tasksDone: (day.tasksDone + tasksDone).clamp(0, 1 << 31),
      pauses: day.pauses,
    );
  }

  // Supabase init/auth
  Future<void> _initSupabase() async {
    try {
      final content = await rootBundle.loadString('assets/env.json');
      final env = jsonDecode(content) as Map<String, dynamic>;
      final url = (env['supabaseUrl'] as String?)?.trim();
      final anonKey = (env['supabaseAnonKey'] as String?)?.trim();
      if (url == null || url.isEmpty || anonKey == null || anonKey.isEmpty) {
        supaReady = false;
        return;
      }
      await Supabase.initialize(url: url, anonKey: anonKey);
      supaReady = true;
    } catch (_) {
      supaReady = false;
    }
  }

  Future<void> _refreshAuthState() async {
    if (!supaReady) { isAuthenticated = false; userId = null; return; }
    final session = Supabase.instance.client.auth.currentSession;
    isAuthenticated = session != null;
    userId = session?.user.id;
  }

  Future<bool> signInWithPassword(String email, String password) async {
    if (!supaReady) return false;
    final res = await Supabase.instance.client.auth.signInWithPassword(email: email, password: password);
    await _refreshAuthState();
    if (isAuthenticated) {
      await loadFromSupabase();
    }
    notifyListeners();
    return res.session != null;
  }

  Future<void> signOut() async {
    if (!supaReady) return;
    await _unsubscribeRealtime();
    await Supabase.instance.client.auth.signOut();
    await _refreshAuthState();
    notifyListeners();
  }

  Future<bool> signUpWithPassword(String email, String password) async {
    if (!supaReady) return false;
    final res = await Supabase.instance.client.auth.signUp(email: email, password: password);
    await _refreshAuthState();
    if (isAuthenticated) {
      await loadFromSupabase();
      await _subscribeTasksRealtime();
    }
    notifyListeners();
    // If email confirmation is required, session may be null
    return res.user != null;
  }

  Future<void> resetPassword(String email, {String? redirectTo}) async {
    if (!supaReady) return;
    await Supabase.instance.client.auth.resetPasswordForEmail(email, redirectTo: redirectTo);
  }

  // Remote mapping helpers
  int _priorityToInt(String p) {
    switch (p) {
      case 'urgent': return 1;
      case 'high': return 2;
      case 'normal': return 3;
      case 'low': return 4;
    }
    return 3;
  }
  String _intToPriority(int v) {
    if (v == 1) return 'urgent';
    if (v == 2) return 'high';
    if (v == 4) return 'low';
    return 'normal';
  }

  DateTime _dateStringToDueDate(String dateStr) {
    // Store at noon UTC to avoid tz issues
    final parts = dateStr.split('-').map(int.parse).toList();
    return DateTime.utc(parts[0], parts[1], parts[2], 12, 0, 0);
  }

  String _dueDateToDateString(String? rfc3339) {
    if (rfc3339 == null) return todayKey();
    final dt = DateTime.parse(rfc3339).toUtc();
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  // Sync operations
  Future<void> loadFromSupabase() async {
    if (!isAuthenticated) return;
    final client = Supabase.instance.client;
    // Settings
    final settings = await client.from('user_settings').select().maybeSingle();
    if (settings != null) {
      focusMinutes = (settings['pomodoro_focus_minutes'] as num?)?.toInt() ?? focusMinutes;
      breakMinutes = (settings['pomodoro_break_minutes'] as num?)?.toInt() ?? breakMinutes;
      longBreakMinutes = (settings['long_break_minutes'] as num?)?.toInt() ?? longBreakMinutes;
      sessionsBeforeLong = (settings['sessions_before_long'] as num?)?.toInt() ?? sessionsBeforeLong;
    } else {
      await _upsertSettingsRemote();
    }
    // Tasks for today
    final today = DateTime.now().toUtc();
    final start = DateTime.utc(today.year, today.month, today.day, 0, 0, 0).toIso8601String();
    final end = DateTime.utc(today.year, today.month, today.day, 23, 59, 59).toIso8601String();
    final rows = await client
        .from('tasks')
        .select()
        .gte('due_date', start)
        .lte('due_date', end)
        .order('updated_at');
    final remoteTasks = (rows as List<dynamic>).cast<Map<String, dynamic>>();
    tasks = remoteTasks
        .map((r) => TaskItem(
              id: r['id'] as String,
              title: (r['title'] as String?) ?? '',
              priority: _intToPriority((r['priority'] as num?)?.toInt() ?? 3),
              done: ((r['status'] as String?) ?? 'todo') == 'done',
              order: (r['updated_at'] != null ? DateTime.parse(r['updated_at']).millisecondsSinceEpoch : DateTime.now().millisecondsSinceEpoch),
              createdAt: (r['created_at'] != null ? DateTime.parse(r['created_at']).millisecondsSinceEpoch : DateTime.now().millisecondsSinceEpoch),
              date: _dueDateToDateString(r['due_date'] as String?),
              updatedAtMs: (r['updated_at'] != null ? DateTime.parse(r['updated_at']).millisecondsSinceEpoch : DateTime.now().millisecondsSinceEpoch),
            ))
        .toList();
    await save();
    notifyListeners();
  }

  Future<void> refreshRemoteStats({int days = 7}) async {
    if (!isAuthenticated) return;
    final client = Supabase.instance.client;
    final now = DateTime.now().toUtc();
    final from = now.subtract(Duration(days: days - 1));
    final start = DateTime.utc(from.year, from.month, from.day, 0, 0, 0).toIso8601String();
    // Focus sessions in range
    final sessions = await client
        .from('focus_sessions')
        .select('started_at, ended_at, duration_seconds')
        .gte('started_at', start);
    final focusList = (sessions as List<dynamic>).cast<Map<String, dynamic>>();
    final Map<String, DayStat> agg = {};
    String keyFor(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    void addDayStat(String k, {int sessions = 0, int focusSeconds = 0, int tasksDone = 0}) {
      final prev = agg[k] ?? DayStat(sessions: 0, focusSeconds: 0, tasksDone: 0);
      agg[k] = prev.copyWith(
        sessions: prev.sessions + sessions,
        focusSeconds: prev.focusSeconds + focusSeconds,
        tasksDone: prev.tasksDone + tasksDone,
      );
    }
    for (final r in focusList) {
      final ended = (r['ended_at'] as String?) ?? r['started_at'] as String;
      final endedDt = DateTime.parse(ended).toUtc();
      final key = keyFor(endedDt);
      addDayStat(key, sessions: 1, focusSeconds: (r['duration_seconds'] as num?)?.toInt() ?? 0);
    }
    // Tasks done in range: count by date(updated_at)
    final tasksDoneRows = await client
        .from('tasks')
        .select('updated_at, status')
        .gte('updated_at', start)
        .eq('status', 'done');
    final tlist = (tasksDoneRows as List<dynamic>).cast<Map<String, dynamic>>();
    for (final r in tlist) {
      final upd = DateTime.parse(r['updated_at'] as String).toUtc();
      final key = keyFor(upd);
      addDayStat(key, tasksDone: 1);
    }
    // Merge into stats map, overriding the fetched days
    for (int i = 0; i < days; i++) {
      final d = DateTime(now.year, now.month, now.day - i);
      final k = keyFor(d);
      if (agg[k] != null) {
        final pauses = stats[k]?.pauses; // keep local pauses counts
        stats[k] = agg[k]!.copyWith(pauses: pauses);
      }
    }
    await save();
    notifyListeners();
  }

  // Blocklist sync (default list)
  Future<void> loadBlocklistFromSupabase() async {
    if (!isAuthenticated) return;
    final client = Supabase.instance.client;
    // Ensure default blocklist exists
    final bl = await client.from('blocklists').select().eq('is_default', true).maybeSingle();
    if (bl == null) {
      final created = await client.from('blocklists').insert({ 'name': 'Default', 'is_default': true }).select().single();
      _defaultBlocklistId = created['id'] as String?;
    } else {
      _defaultBlocklistId = bl['id'] as String?;
    }
    if (_defaultBlocklistId == null) return;
    final items = await client.from('blocklist_items').select().eq('blocklist_id', _defaultBlocklistId);
    final list = (items as List<dynamic>).cast<Map<String, dynamic>>().map((r) => (r['pattern'] as String?)?.trim() ?? '').where((s) => s.isNotEmpty).toSet().toList();
    blocklistDomains = list..sort();
    notifyListeners();
  }

  Future<void> addBlocklistDomain(String domain) async {
    final normalized = _normalizeDomain(domain);
    if (normalized == null) return;
    if (!blocklistDomains.contains(normalized)) blocklistDomains.add(normalized);
    blocklistDomains.sort();
    notifyListeners();
    if (isAuthenticated && _defaultBlocklistId != null) {
      try {
        await Supabase.instance.client.from('blocklist_items').insert({ 'blocklist_id': _defaultBlocklistId, 'pattern': normalized });
      } catch (_) {}
    }
  }

  Future<void> removeBlocklistDomain(String domain) async {
    blocklistDomains.remove(domain);
    notifyListeners();
    if (isAuthenticated && _defaultBlocklistId != null) {
      try {
        await Supabase.instance.client.from('blocklist_items').delete().eq('blocklist_id', _defaultBlocklistId).eq('pattern', domain);
      } catch (_) {}
    }
  }

  String? _normalizeDomain(String input) {
    try {
      var v = input.trim().toLowerCase();
      v = v.replaceAll(RegExp(r'^https?://'), '').replaceAll(RegExp(r'^www\.'), '');
      v = v.split('/')[0].split('?')[0];
      if (v.isEmpty) return null; return v;
    } catch (_) { return null; }
  }

  Future<void> _subscribeTasksRealtime() async {
    await _unsubscribeRealtime();
    if (!isAuthenticated) return;
    final uid = userId;
    if (uid == null) return;
    _tasksChannel = Supabase.instance.client.channel('public:tasks')
      ..on(
        RealtimeListenTypes.postgresChanges,
        ChannelFilter(event: '*', schema: 'public', table: 'tasks', filter: 'user_id=eq.$uid'),
        (payload, [ref]) async {
          final row = payload['new'] ?? payload['old'] ?? {};
          final String eventType = payload['eventType'] as String? ?? '';
          _applyRemoteTaskChange(eventType: eventType, row: Map<String, dynamic>.from(row));
        },
      )
      ..subscribe();
  }

  Future<void> _unsubscribeRealtime() async {
    if (_tasksChannel != null) {
      await Supabase.instance.client.removeChannel(_tasksChannel!);
      _tasksChannel = null;
    }
  }

  void _applyRemoteTaskChange({required String eventType, required Map<String, dynamic> row}) {
    // Only handle today's tasks
    final dateStr = _dueDateToDateString(row['due_date'] as String?);
    if (dateStr != todayKey()) return;
    final id = row['id'] as String?;
    if (id == null) return;
    final remoteUpdated = (row['updated_at'] != null ? DateTime.parse(row['updated_at']).millisecondsSinceEpoch : 0);
    final idx = tasks.indexWhere((t) => t.id == id);
    if (eventType == 'DELETE') {
      if (idx >= 0) {
        tasks.removeAt(idx);
        save();
        notifyListeners();
      }
      return;
    }
    final incoming = TaskItem(
      id: id,
      title: (row['title'] as String?) ?? '',
      priority: _intToPriority((row['priority'] as num?)?.toInt() ?? 3),
      done: ((row['status'] as String?) ?? 'todo') == 'done',
      order: remoteUpdated,
      createdAt: (row['created_at'] != null ? DateTime.parse(row['created_at']).millisecondsSinceEpoch : DateTime.now().millisecondsSinceEpoch),
      date: dateStr,
      updatedAtMs: remoteUpdated,
    );
    if (idx == -1) {
      tasks = [...tasks, incoming];
    } else {
      // Conflict resolution: take the more recent updatedAt
      if ((tasks[idx].updatedAtMs ?? 0) <= remoteUpdated) {
        tasks[idx] = incoming;
      }
    }
    save();
    notifyListeners();
  }

  Future<void> _upsertSettingsRemote() async {
    if (!isAuthenticated) return;
    final client = Supabase.instance.client;
    await client.from('user_settings').upsert({
      'user_id': userId,
      'pomodoro_focus_minutes': focusMinutes,
      'pomodoro_break_minutes': breakMinutes,
      'long_break_minutes': longBreakMinutes,
      'sessions_before_long': sessionsBeforeLong,
      'updated_at': DateTime.now().toIso8601String(),
    }, onConflict: 'user_id');
  }

  Future<void> startFocus([int? minutes]) async {
    final m = minutes ?? focusMinutes;
    currentMode = 'focus';
    sessionStart = DateTime.now();
    sessionEnd = DateTime.now().add(Duration(minutes: m));
    await save();
    notifyListeners();
  }

  Future<void> stopFocus({String? reason}) async {
    // Record partial duration if stopping early
    if (currentMode == 'focus' && sessionStart != null) {
      final seconds = DateTime.now().difference(sessionStart!).inSeconds;
      _addStat(sessions: 1, focusSeconds: seconds);
      // Remote session record
      if (isAuthenticated) {
        final client = Supabase.instance.client;
        await client.from('focus_sessions').insert({
          'user_id': userId,
          'session_type': 'pomodoro',
          'started_at': sessionStart!.toUtc().toIso8601String(),
          'ended_at': DateTime.now().toUtc().toIso8601String(),
          'duration_seconds': seconds,
          'completed': false,
        });
      }
      if (reason != null && reason.isNotEmpty) {
        final key = todayKey();
        final day = stats[key] ?? DayStat(sessions: 0, focusSeconds: 0, tasksDone: 0);
        final pauses = Map<String, int>.from(day.pauses);
        pauses[reason] = (pauses[reason] ?? 0) + 1;
        stats[key] = day.copyWith(pauses: pauses);
      }
    }
    currentMode = 'idle';
    sessionStart = null;
    sessionEnd = null;
    await save();
    notifyListeners();
  }

  Future<void> startPomodoroCycle() async {
    completedFocusCount = 0;
    await startMode('focus', focusMinutes);
  }

  Future<void> stopPomodoroCycle() async {
    currentMode = 'idle';
    sessionStart = null;
    sessionEnd = null;
    await save();
    notifyListeners();
  }

  Future<void> startMode(String mode, int minutes) async {
    currentMode = mode;
    sessionStart = mode == 'focus' ? DateTime.now() : null;
    sessionEnd = DateTime.now().add(Duration(minutes: minutes));
    await save();
    notifyListeners();
  }

  Future<void> _onAlarm() async {
    if (currentMode == 'focus') {
      final seconds = sessionStart != null ? sessionEnd!.difference(sessionStart!).inSeconds : focusMinutes * 60;
      _addStat(sessions: 1, focusSeconds: seconds);
      if (isAuthenticated && sessionStart != null) {
        final client = Supabase.instance.client;
        await client.from('focus_sessions').insert({
          'user_id': userId,
          'session_type': 'pomodoro',
          'started_at': sessionStart!.toUtc().toIso8601String(),
          'ended_at': sessionEnd!.toUtc().toIso8601String(),
          'duration_seconds': seconds,
          'completed': true,
        });
      }
      completedFocusCount += 1;
      final useLong = completedFocusCount % sessionsBeforeLong == 0;
      if (autoStartNext) {
        await startMode('break', useLong ? longBreakMinutes : breakMinutes);
      } else {
        currentMode = 'break';
        sessionStart = null;
        sessionEnd = null;
        await save();
        notifyListeners();
      }
    } else if (currentMode == 'break') {
      if (autoStartNext) {
        await startMode('focus', focusMinutes);
      } else {
        currentMode = 'idle';
        sessionStart = null;
        sessionEnd = null;
        await save();
        notifyListeners();
      }
    }
  }

  Future<void> toggleTaskDone(TaskItem task) async {
    final idx = tasks.indexWhere((t) => t.id == task.id);
    if (idx == -1) return;
    final prev = tasks[idx].done;
    tasks[idx] = tasks[idx].copyWith(done: !prev, updatedAtMs: DateTime.now().millisecondsSinceEpoch);
    if (!prev) _addStat(tasksDone: 1); else _addStat(tasksDone: -1);
    if (isAuthenticated) {
      try {
        await Supabase.instance.client.from('tasks').update({
          'status': (!prev) ? 'done' : 'todo',
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', task.id);
      } catch (_) {}
    }
    await save();
    notifyListeners();
  }

  Future<void> addTask(String title, String priority) async {
    final local = TaskItem(
      id: UniqueKey().toString(),
      title: title.trim(),
      priority: priority,
      done: false,
      order: DateTime.now().millisecondsSinceEpoch,
      createdAt: DateTime.now().millisecondsSinceEpoch,
      date: todayKey(),
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    TaskItem toInsert = local;
    if (isAuthenticated) {
      try {
        final row = await Supabase.instance.client.from('tasks').insert({
          'title': local.title,
          'notes': null,
          'priority': _priorityToInt(local.priority),
          'status': 'todo',
          'due_date': _dateStringToDueDate(local.date).toIso8601String(),
          'updated_at': DateTime.now().toIso8601String(),
        }).select().single();
        toInsert = local.copyWith(id: row['id'] as String, updatedAtMs: DateTime.parse(row['updated_at']).millisecondsSinceEpoch);
      } catch (_) {}
    }
    tasks = [...tasks, toInsert];
    await save();
    notifyListeners();
  }

  Future<void> deleteTask(String id) async {
    final idx = tasks.indexWhere((t) => t.id == id);
    if (idx == -1) return;
    final wasDone = tasks[idx].done;
    tasks.removeAt(idx);
    if (isAuthenticated) {
      try { await Supabase.instance.client.from('tasks').delete().eq('id', id); } catch (_) {}
    }
    if (wasDone) _addStat(tasksDone: -1);
    await save();
    notifyListeners();
  }

  Future<void> reorderTasks(int oldIndex, int newIndex) async {
    if (newIndex > oldIndex) newIndex -= 1;
    final item = tasks.removeAt(oldIndex);
    tasks.insert(newIndex, item);
    // Reassign order values locally
    for (int i = 0; i < tasks.length; i++) {
      tasks[i] = tasks[i].copyWith(order: i, updatedAtMs: DateTime.now().millisecondsSinceEpoch);
    }
    await save();
    notifyListeners();
  }
}

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});
  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _resetEmail = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _isSignup = false;
  String? _info;

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('FocusKit', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    if (!app.supaReady)
                      const Text('Supabase not configured. Edit assets/env.json.', textAlign: TextAlign.center),
                    if (app.supaReady) ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ChoiceChip(label: const Text('Sign in'), selected: !_isSignup, onSelected: (_) => setState(() => _isSignup = false)),
                          const SizedBox(width: 8),
                          ChoiceChip(label: const Text('Sign up'), selected: _isSignup, onSelected: (_) => setState(() => _isSignup = true)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
                      const SizedBox(height: 12),
                      TextField(controller: _password, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
                      const SizedBox(height: 12),
                      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                      if (_info != null) Text(_info!, style: const TextStyle(color: Colors.green)),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _loading ? null : () async {
                          setState(() { _loading = true; _error = null; _info = null; });
                          try {
                            bool ok = false;
                            if (_isSignup) {
                              ok = await context.read<AppState>().signUpWithPassword(_email.text.trim(), _password.text);
                              if (!ok) {
                                _info = 'Check your inbox to confirm your email.';
                              }
                            } else {
                              ok = await context.read<AppState>().signInWithPassword(_email.text.trim(), _password.text);
                            }
                            if (!ok && !_isSignup) setState(() { _error = 'Sign-in failed'; });
                          } catch (e) {
                            setState(() { _error = '$e'; });
                          } finally {
                            if (mounted) setState(() { _loading = false; });
                          }
                        },
                        child: _loading ? const CircularProgressIndicator() : Text(_isSignup ? 'Create account' : 'Sign in'),
                      ),
                      const SizedBox(height: 16),
                      const Divider(),
                      const SizedBox(height: 8),
                      Text('Forgot password?', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 8),
                      TextField(controller: _resetEmail, decoration: const InputDecoration(labelText: 'Email for reset')),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () async {
                          setState(() { _error = null; _info = null; });
                          try {
                            await context.read<AppState>().resetPassword(_resetEmail.text.trim());
                            setState(() { _info = 'Reset email sent (if the address exists).'; });
                          } catch (e) {
                            setState(() { _error = '$e'; });
                          }
                        },
                        child: const Text('Send reset email'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class TaskItem {
  final String id;
  final String title;
  final String priority; // low | normal | high | urgent
  final bool done;
  final int order;
  final int createdAt;
  final String date; // yyyy-mm-dd
  final int? updatedAtMs;

  TaskItem({
    required this.id,
    required this.title,
    required this.priority,
    required this.done,
    required this.order,
    required this.createdAt,
    required this.date,
    this.updatedAtMs,
  });

  TaskItem copyWith({
    String? id,
    String? title,
    String? priority,
    bool? done,
    int? order,
    int? createdAt,
    String? date,
    int? updatedAtMs,
  }) {
    return TaskItem(
      id: id ?? this.id,
      title: title ?? this.title,
      priority: priority ?? this.priority,
      done: done ?? this.done,
      order: order ?? this.order,
      createdAt: createdAt ?? this.createdAt,
      date: date ?? this.date,
      updatedAtMs: updatedAtMs ?? this.updatedAtMs,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'priority': priority,
        'done': done,
        'order': order,
        'createdAt': createdAt,
        'date': date,
        'updatedAtMs': updatedAtMs,
      };

  static TaskItem fromJson(Map<String, dynamic> json) => TaskItem(
        id: json['id'] as String,
        title: json['title'] as String,
        priority: json['priority'] as String,
        done: json['done'] as bool,
        order: json['order'] as int,
        createdAt: json['createdAt'] as int,
        date: json['date'] as String,
        updatedAtMs: (json['updatedAtMs'] as num?)?.toInt(),
      );
}

class DayStat {
  final int sessions;
  final int focusSeconds;
  final int tasksDone;
  final Map<String, int> pauses;

  DayStat(
      {required this.sessions,
      required this.focusSeconds,
      required this.tasksDone,
      Map<String, int>? pauses})
      : pauses = pauses ?? {};

  DayStat copyWith({int? sessions, int? focusSeconds, int? tasksDone, Map<String, int>? pauses}) {
    return DayStat(
      sessions: sessions ?? this.sessions,
      focusSeconds: focusSeconds ?? this.focusSeconds,
      tasksDone: tasksDone ?? this.tasksDone,
      pauses: pauses ?? this.pauses,
    );
  }

  Map<String, dynamic> toJson() => {
        'sessions': sessions,
        'focusSeconds': focusSeconds,
        'tasksDone': tasksDone,
        'pauses': pauses,
      };

  static DayStat fromJson(Map<String, dynamic> json) => DayStat(
        sessions: (json['sessions'] as num).toInt(),
        focusSeconds: (json['focusSeconds'] as num).toInt(),
        tasksDone: (json['tasksDone'] as num).toInt(),
        pauses: (json['pauses'] as Map?)?.map((k, v) => MapEntry(k as String, (v as num).toInt())),
      );
}

class TimerPage extends StatelessWidget {
  const TimerPage({super.key});

  String _formatRemaining(DateTime? end) {
    if (end == null) return '--:--';
    final delta = end.difference(DateTime.now());
    final total = delta.inSeconds;
    if (total <= 0) return '00:00';
    final m = (total ~/ 60).toString().padLeft(2, '0');
    final s = (total % 60).toString().padStart(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          Text('Mode: ${app.currentMode}', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(_formatRemaining(app.sessionEnd), style: Theme.of(context).textTheme.displayMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ElevatedButton.icon(onPressed: () => app.startFocus(), icon: const Icon(Icons.play_arrow), label: const Text('Start Focus')),
              OutlinedButton.icon(onPressed: () => app.stopFocus(), icon: const Icon(Icons.stop), label: const Text('Stop')),
              ElevatedButton.icon(onPressed: () => app.startPomodoroCycle(), icon: const Icon(Icons.av_timer), label: const Text('Start Pomodoro')),
              OutlinedButton.icon(onPressed: () => app.stopPomodoroCycle(), icon: const Icon(Icons.stop_circle_outlined), label: const Text('Stop Pomodoro')),
            ],
          ),
          const SizedBox(height: 16),
          Row(children: [
            Flexible(child: _numField(context, 'Focus (min)', app.focusMinutes, (v) { app.focusMinutes = v; app.save(); })),
            const SizedBox(width: 8),
            Flexible(child: _numField(context, 'Break', app.breakMinutes, (v) { app.breakMinutes = v; app.save(); })),
            const SizedBox(width: 8),
            Flexible(child: _numField(context, 'Long', app.longBreakMinutes, (v) { app.longBreakMinutes = v; app.save(); })),
            const SizedBox(width: 8),
            Flexible(child: _numField(context, 'Before long', app.sessionsBeforeLong, (v) { app.sessionsBeforeLong = v; app.save(); })),
          ]),
          SwitchListTile(value: app.autoStartNext, onChanged: (b) { app.autoStartNext = b; app.save(); }, title: const Text('Auto-start next phase')),
        ],
      ),
    );
  }

  Widget _numField(BuildContext context, String label, int value, void Function(int) onChanged) {
    final controller = TextEditingController(text: value.toString());
    return TextField(
      controller: controller,
      decoration: InputDecoration(labelText: label),
      keyboardType: TextInputType.number,
      onSubmitted: (s) {
        final v = int.tryParse(s) ?? value;
        onChanged(v);
      },
    );
  }
}

class TasksPage extends StatefulWidget {
  const TasksPage({super.key});
  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  final TextEditingController _controller = TextEditingController();
  String _priority = 'normal';

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final todays = app.tasks.where((t) => t.date == app.todayKey()).toList()
      ..sort((a, b) => a.done == b.done ? a.order.compareTo(b.order) : (a.done ? 1 : -1));

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(hintText: 'Add a task…'),
                  onSubmitted: (_) => _onAdd(app),
                ),
              ),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: _priority,
                onChanged: (v) => setState(() => _priority = v ?? 'normal'),
                items: const [
                  DropdownMenuItem(value: 'low', child: Text('Low')),
                  DropdownMenuItem(value: 'normal', child: Text('Normal')),
                  DropdownMenuItem(value: 'high', child: Text('High')),
                  DropdownMenuItem(value: 'urgent', child: Text('Urgent')),
                ],
              ),
              const SizedBox(width: 8),
              ElevatedButton(onPressed: () => _onAdd(app), child: const Text('Add')),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ReorderableListView.builder(
              itemCount: todays.length,
              onReorder: (o, n) => app.reorderTasks(o, n),
              itemBuilder: (context, i) {
                final t = todays[i];
                return ListTile(
                  key: ValueKey(t.id),
                  leading: Checkbox(value: t.done, onChanged: (_) => app.toggleTaskDone(t)),
                  title: Text(
                    t.title,
                    style: TextStyle(
                      decoration: t.done ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  subtitle: Text('Priority: ${t.priority}'),
                  trailing: Wrap(spacing: 8, children: [
                    OutlinedButton(
                      onPressed: () => app.startFocus(),
                      child: const Text('Focus'),
                    ),
                    IconButton(
                      onPressed: () => app.deleteTask(t.id),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onAdd(AppState app) async {
    final title = _controller.text.trim();
    if (title.isEmpty) return;
    await app.addTask(title, _priority);
    _controller.clear();
  }
}

class ReportsPage extends StatelessWidget {
  const ReportsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final now = DateTime.now();
    final days = List.generate(7, (i) {
      final d = DateTime(now.year, now.month, now.day - (6 - i));
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final stat = app.stats[key] ?? DayStat(sessions: 0, focusSeconds: 0, tasksDone: 0);
      return _DayRow(date: d, stat: stat);
    });

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Last 7 days', style: Theme.of(context).textTheme.titleMedium),
              Row(children: [
                OutlinedButton.icon(
                  onPressed: () => app.refreshRemoteStats(days: 7),
                  icon: const Icon(Icons.sync),
                  label: const Text('Sync now'),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: () => _exportCsv(context, app),
                  icon: const Icon(Icons.download),
                  label: const Text('Export CSV'),
                ),
              ]),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: const [
              Expanded(child: Text('Date', style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(child: Text('Focus', style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(child: Text('Sessions', style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(child: Text('Tasks', style: TextStyle(fontWeight: FontWeight.w600))),
            ],
          ),
          const Divider(),
          ...days,
        ],
      ),
    );
  }

  void _exportCsv(BuildContext context, AppState app) {
    final now = DateTime.now();
    final rows = <List<String>>[
      ['Date', 'Focus minutes', 'Sessions', 'Tasks done']
    ];
    for (int i = 29; i >= 0; i--) {
      final d = DateTime(now.year, now.month, now.day - i);
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final stat = app.stats[key] ?? DayStat(sessions: 0, focusSeconds: 0, tasksDone: 0);
      rows.add([key, (stat.focusSeconds ~/ 60).toString(), stat.sessions.toString(), stat.tasksDone.toString()]);
    }
    final csv = rows.map((r) => r.map(_csv).join(',')).join('\n');
    // For web, offer download. For others, show dialog with text for now.
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('CSV'),
        content: SingleChildScrollView(child: SelectableText(csv)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }

  String _csv(String v) {
    if (v.contains(',') || v.contains('\n') || v.contains('"')) {
      return '"' + v.replaceAll('"', '""') + '"';
    }
    return v;
  }
}

class _DayRow extends StatelessWidget {
  final DateTime date; final DayStat stat;
  const _DayRow({required this.date, required this.stat});

  @override
  Widget build(BuildContext context) {
    String formatMinutes(int m) {
      if (m < 60) return '${m}m';
      final h = m ~/ 60; final mm = m % 60; return mm > 0 ? '${h}h ${mm}m' : '${h}h';
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(DateFormat.MMMd().format(date))),
          Expanded(child: Text(formatMinutes(stat.focusSeconds ~/ 60))),
          Expanded(child: Text('${stat.sessions}')),
          Expanded(child: Text('${stat.tasksDone}')),
        ],
      ),
    );
  }
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Appearance', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'system', label: Text('System')),
            ButtonSegment(value: 'light', label: Text('Light')),
            ButtonSegment(value: 'dark', label: Text('Dark')),
          ],
          selected: {app.themeMode},
          onSelectionChanged: (s) { app.themeMode = s.first; app.save(); },
        ),
        const SizedBox(height: 24),
        const Text('Sync (Supabase)', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        if (!app.supaReady) const Text('Supabase not configured. Edit assets/env.json'),
        if (app.supaReady && app.isAuthenticated)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Signed in as ${app.userId}'),
              OutlinedButton(onPressed: () => app.signOut(), child: const Text('Sign out')),
            ],
          ),
        if (app.supaReady && !app.isAuthenticated)
          const Text('Please sign in to sync (tap back and go to Sign In screen).'),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Blocklist (Default)', style: TextStyle(fontWeight: FontWeight.w600)),
            if (app.isAuthenticated)
              OutlinedButton(onPressed: () => app.loadBlocklistFromSupabase(), child: const Text('Refresh')),
          ],
        ),
        const SizedBox(height: 8),
        _BlocklistEditor(),
        const SizedBox(height: 24),
        const Text('Sync (Supabase)', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        if (!app.supaReady) const Text('Supabase not configured. Edit assets/env.json'),
        if (app.supaReady && app.isAuthenticated)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Signed in as ${app.userId}'),
              OutlinedButton(onPressed: () => app.signOut(), child: const Text('Sign out')),
            ],
          ),
        if (app.supaReady && !app.isAuthenticated)
          const Text('Please sign in to sync (tap back and go to Sign In screen).'),
      ],
    );
  }
}

class _BlocklistEditor extends StatefulWidget {
  @override
  State<_BlocklistEditor> createState() => _BlocklistEditorState();
}

class _BlocklistEditorState extends State<_BlocklistEditor> {
  final _controller = TextEditingController();
  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                decoration: const InputDecoration(hintText: 'Add domain (e.g., youtube.com)'),
                onSubmitted: (_) => _add(app),
              ),
            ),
            const SizedBox(width: 8),
            ElevatedButton(onPressed: () => _add(app), child: const Text('Add')),
          ],
        ),
        const SizedBox(height: 8),
        ...app.blocklistDomains.map((d) => ListTile(
              dense: true,
              title: Text(d),
              trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => app.removeBlocklistDomain(d)),
            )),
      ],
    );
  }
  Future<void> _add(AppState app) async {
    final v = _controller.text.trim();
    if (v.isEmpty) return;
    await app.addBlocklistDomain(v);
    _controller.clear();
  }
}