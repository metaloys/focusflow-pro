import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
            home: const HomePage(),
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
    tasks[idx] = tasks[idx].copyWith(done: !prev);
    if (!prev) _addStat(tasksDone: 1); else _addStat(tasksDone: -1);
    await save();
    notifyListeners();
  }

  Future<void> addTask(String title, String priority) async {
    tasks = [
      ...tasks,
      TaskItem(
        id: UniqueKey().toString(),
        title: title.trim(),
        priority: priority,
        done: false,
        order: DateTime.now().millisecondsSinceEpoch,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        date: todayKey(),
      ),
    ];
    await save();
    notifyListeners();
  }

  Future<void> deleteTask(String id) async {
    final idx = tasks.indexWhere((t) => t.id == id);
    if (idx == -1) return;
    final wasDone = tasks[idx].done;
    tasks.removeAt(idx);
    if (wasDone) _addStat(tasksDone: -1);
    await save();
    notifyListeners();
  }

  Future<void> reorderTasks(int oldIndex, int newIndex) async {
    if (newIndex > oldIndex) newIndex -= 1;
    final item = tasks.removeAt(oldIndex);
    tasks.insert(newIndex, item);
    // Reassign order values
    for (int i = 0; i < tasks.length; i++) {
      tasks[i] = tasks[i].copyWith(order: i);
    }
    await save();
    notifyListeners();
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

  TaskItem({
    required this.id,
    required this.title,
    required this.priority,
    required this.done,
    required this.order,
    required this.createdAt,
    required this.date,
  });

  TaskItem copyWith({
    String? id,
    String? title,
    String? priority,
    bool? done,
    int? order,
    int? createdAt,
    String? date,
  }) {
    return TaskItem(
      id: id ?? this.id,
      title: title ?? this.title,
      priority: priority ?? this.priority,
      done: done ?? this.done,
      order: order ?? this.order,
      createdAt: createdAt ?? this.createdAt,
      date: date ?? this.date,
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
      };

  static TaskItem fromJson(Map<String, dynamic> json) => TaskItem(
        id: json['id'] as String,
        title: json['title'] as String,
        priority: json['priority'] as String,
        done: json['done'] as bool,
        order: json['order'] as int,
        createdAt: json['createdAt'] as int,
        date: json['date'] as String,
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
              OutlinedButton.icon(
                onPressed: () => _exportCsv(context, app),
                icon: const Icon(Icons.download),
                label: const Text('Export CSV'),
              ),
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
        Text('Configure your Supabase project in assets/env.json (url + anon key). Syncing will be added in a follow-up.'),
      ],
    );
  }
}