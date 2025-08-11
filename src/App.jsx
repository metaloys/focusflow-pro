import React, { useState, useEffect, useRef } from 'react';

const App = () => {
  const [activeTab, setActiveTab] = useState('focus');
  const [activeTasks, setActiveTasks] = useState([
    { id: 1, text: 'Complete project proposal', priority: 'high', category: 'work', completed: false, dueDate: null, createdAt: new Date().toISOString() },
    { id: 2, text: 'Review team feedback', priority: 'medium', category: 'work', completed: false, dueDate: null, createdAt: new Date().toISOString() },
    { id: 3, text: 'Schedule client meeting', priority: 'low', category: 'communication', completed: false, dueDate: null, createdAt: new Date().toISOString() },
    { id: 4, text: 'Research new tools', priority: 'medium', category: 'learning', completed: false, dueDate: null, createdAt: new Date().toISOString() }
  ]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('work');
  const [newDueDate, setNewDueDate] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [workDuration, setWorkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [longBreakDuration, setLongBreakDuration] = useState(15);
  const [sessionsBeforeLongBreak, setSessionsBeforeLongBreak] = useState(4);
  const [currentSession, setCurrentSession] = useState(0);
  const [isWorkTime, setIsWorkTime] = useState(true);
  const [blockedSites, setBlockedSites] = useState(['facebook.com', 'youtube.com', 'twitter.com', 'instagram.com']);
  const [newSite, setNewSite] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState('info');
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(23);
  const [completedTasksCount, setCompletedTasksCount] = useState(41);
  const [weeklyData, setWeeklyData] = useState([
    { name: 'Mon', sessions: 3, tasks: 5 },
    { name: 'Tue', sessions: 4, tasks: 8 },
    { name: 'Wed', sessions: 2, tasks: 4 },
    { name: 'Thu', sessions: 5, tasks: 9 },
    { name: 'Fri', sessions: 3, tasks: 6 },
    { name: 'Sat', sessions: 1, tasks: 2 },
    { name: 'Sun', sessions: 0, tasks: 1 }
  ]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [meetingMode, setMeetingMode] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [tomorrowPriority, setTomorrowPriority] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Editing state
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [editTaskPriority, setEditTaskPriority] = useState('medium');
  const [editTaskCategory, setEditTaskCategory] = useState('work');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');

  const timerRef = useRef(null);
  const notificationTimerRef = useRef(null);
  const reminderIntervalRef = useRef(null);

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedActiveTasks = localStorage.getItem('activeTasks');
    const savedCompletedTasks = localStorage.getItem('completedTasks');
    const savedSites = localStorage.getItem('blockedSites');
    const savedSettings = localStorage.getItem('settings');
    const savedOnboarding = localStorage.getItem('onboardingSeen');
    
    if (savedActiveTasks) {
      try {
        setActiveTasks(JSON.parse(savedActiveTasks));
      } catch (e) {
        console.error('Error parsing active tasks from localStorage');
      }
    }
    
    if (savedCompletedTasks) {
      try {
        setCompletedTasks(JSON.parse(savedCompletedTasks));
      } catch (e) {
        console.error('Error parsing completed tasks from localStorage');
      }
    }
    
    if (savedSites) {
      try {
        setBlockedSites(JSON.parse(savedSites));
      } catch (e) {
        console.error('Error parsing blocked sites from localStorage');
      }
    }
    
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        setWorkDuration(settings.workDuration || 25);
        setBreakDuration(settings.breakDuration || 5);
        setLongBreakDuration(settings.longBreakDuration || 15);
        setSessionsBeforeLongBreak(settings.sessionsBeforeLongBreak || 4);
        setDarkMode(settings.darkMode || false);
      } catch (e) {
        console.error('Error parsing settings from localStorage');
      }
    }
    
    if (savedOnboarding) {
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }

    // Apply dark mode
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Save data to localStorage whenever relevant state changes
  useEffect(() => {
    try {
      localStorage.setItem('activeTasks', JSON.stringify(activeTasks));
    } catch (e) {
      console.error('Error saving active tasks to localStorage');
    }
  }, [activeTasks]);

  useEffect(() => {
    try {
      localStorage.setItem('completedTasks', JSON.stringify(completedTasks));
    } catch (e) {
      console.error('Error saving completed tasks to localStorage');
    }
  }, [completedTasks]);

  useEffect(() => {
    try {
      localStorage.setItem('blockedSites', JSON.stringify(blockedSites));
    } catch (e) {
      console.error('Error saving blocked sites to localStorage');
    }
  }, [blockedSites]);

  useEffect(() => {
    try {
      localStorage.setItem('settings', JSON.stringify({ 
        workDuration, 
        breakDuration, 
        longBreakDuration, 
        sessionsBeforeLongBreak, 
        darkMode 
      }));
    } catch (e) {
      console.error('Error saving settings to localStorage');
    }
  }, [workDuration, breakDuration, longBreakDuration, sessionsBeforeLongBreak, darkMode]);

  // Apply dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Timer functionality
  useEffect(() => {
    if (isRunning && timeLeft > 0 && !meetingMode) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      handleTimerComplete();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, timeLeft, currentSession, sessionsBeforeLongBreak, workDuration, breakDuration, longBreakDuration, meetingMode]);

  // Reminder functionality
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      
      activeTasks.forEach(task => {
        if (task.dueDate) {
          const dueTime = new Date(task.dueDate).getTime();
          const timeLeft = dueTime - now;
          
          // Check if due within the next hour
          if (timeLeft <= 60 * 60 * 1000 && timeLeft > 0) {
            showNotificationWithTimer(`Task "${task.text}" is due soon!`, 'info');
          }
          // Check if overdue
          else if (timeLeft <= 0) {
            showNotificationWithTimer(`Task "${task.text}" is overdue!`, 'warning');
          }
        }
      });
    };
    
    // Check reminders every minute
    reminderIntervalRef.current = setInterval(checkReminders, 60 * 1000);
    
    return () => {
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
    };
  }, [activeTasks]);

  const showNotificationWithTimer = (message, type = 'info') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    
    notificationTimerRef.current = setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };

  const handleTimerComplete = () => {
    setIsRunning(false);
    
    if (isWorkTime) {
      const nextSession = currentSession + 1;
      setCurrentSession(nextSession);
      
      const isLongBreak = nextSession % sessionsBeforeLongBreak === 0;
      
      if (isLongBreak) {
        setIsWorkTime(false);
        setTimeLeft(longBreakDuration * 60);
        showNotificationWithTimer(`Excellent work! Take a ${longBreakDuration}-minute long break to recharge.`, 'success');
      } else {
        setIsWorkTime(false);
        setTimeLeft(breakDuration * 60);
        showBreakTip();
      }
      
      setCompletedSessions(prev => prev + 1);
      
      // Update weekly data
      updateWeeklyData('sessions');
    } else {
      setIsWorkTime(true);
      setTimeLeft(workDuration * 60);
      showNotificationWithTimer('Break time is over! Ready to crush your next task?', 'info');
    }
  };

  const showBreakTip = () => {
    const tips = [
      { message: 'Stand up and stretch for 1-2 minutes to refresh your body.', type: 'stretch' },
      { message: 'Walk around for 2 minutes to boost your creativity.', type: 'walk' },
      { message: 'Drink a glass of water to stay hydrated and focused.', type: 'hydration' },
      { message: 'Look away from screens for 20 seconds to rest your eyes.', type: 'eyes' },
      { message: 'Take 5 deep breaths to reduce stress and increase oxygen.', type: 'breathing' }
    ];
    
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    showNotificationWithTimer(randomTip.message, 'break-tip');
  };

  const startTimer = () => {
    if (timeLeft === 0) {
      setIsWorkTime(true);
      setTimeLeft(workDuration * 60);
    }
    setIsRunning(true);
    showNotificationWithTimer('Focus session started! Distractions are blocked.', 'success');
  };

  const pauseTimer = () => {
    setIsRunning(false);
    showNotificationWithTimer('Focus session paused. You can resume anytime.', 'info');
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsWorkTime(true);
    setTimeLeft(workDuration * 60);
    setCurrentSession(0);
    showNotificationWithTimer('Timer reset to default settings.', 'info');
  };

  const addTask = () => {
    if (newTask.trim()) {
      const newTaskObj = {
        id: Date.now(),
        text: newTask,
        priority,
        category,
        completed: false,
        dueDate: newDueDate || null,
        createdAt: new Date().toISOString()
      };
      
      setActiveTasks([...activeTasks, newTaskObj]);
      setNewTask('');
      setNewDueDate('');
      showNotificationWithTimer('Task added with due date!', 'success');
    }
  };

  const toggleTask = (id) => {
    const taskToMove = activeTasks.find(task => task.id === id);
    if (taskToMove) {
      setActiveTasks(activeTasks.filter(task => task.id !== id));
      setCompletedTasks([...completedTasks, { ...taskToMove, completed: true, completedAt: new Date().toISOString() }]);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      setCompletedTasksCount(prev => prev + 1);
      showNotificationWithTimer('Task completed and moved to archive! 🎉', 'success');
      
      // Update weekly data
      updateWeeklyData('tasks');
    }
  };

  const undoComplete = (id) => {
    const taskToUndo = completedTasks.find(task => task.id === id);
    if (taskToUndo) {
      setCompletedTasks(completedTasks.filter(task => task.id !== id));
      setActiveTasks([...activeTasks, { ...taskToUndo, completed: false }]);
      showNotificationWithTimer('Task moved back to active list.', 'info');
    }
  };

  const removeTask = (id) => {
    setActiveTasks(activeTasks.filter(task => task.id !== id));
    showNotificationWithTimer('Task removed from your list.', 'info');
  };

  const startEditingTask = (task) => {
    setEditingTaskId(task.id);
    setEditTaskText(task.text);
    setEditTaskPriority(task.priority);
    setEditTaskCategory(task.category);
    setEditTaskDueDate(task.dueDate || '');
  };

  const saveTaskEdit = (id) => {
    if (editTaskText.trim()) {
      const updatedTask = {
        id,
        text: editTaskText,
        priority: editTaskPriority,
        category: editTaskCategory,
        completed: false,
        dueDate: editTaskDueDate || null,
        createdAt: new Date().toISOString()
      };
      
      setActiveTasks(activeTasks.map(task => task.id === id ? updatedTask : task));
      setEditingTaskId(null);
      showNotificationWithTimer('Task updated successfully!', 'success');
    } else {
      showNotificationWithTimer('Task name cannot be empty.', 'warning');
    }
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    showNotificationWithTimer('Editing cancelled.', 'info');
  };

  const addBlockedSite = () => {
    if (newSite.trim()) {
      const formattedSite = newSite.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (!blockedSites.includes(formattedSite)) {
        setBlockedSites([...blockedSites, formattedSite]);
        setNewSite('');
        showNotificationWithTimer(`"${formattedSite}" added to blocked sites.`, 'success');
      } else {
        showNotificationWithTimer(`"${formattedSite}" is already in your blocked list.`, 'info');
      }
    }
  };

  const removeBlockedSite = (site) => {
    setBlockedSites(blockedSites.filter(s => s !== site));
    showNotificationWithTimer(`"${site}" removed from blocked sites.`, 'info');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      addTask();
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-500 border-red-200 bg-red-50';
      case 'medium': return 'text-yellow-600 border-yellow-200 bg-yellow-50';
      case 'low': return 'text-green-600 border-green-200 bg-green-50';
      default: return 'text-gray-500 border-gray-200 bg-gray-50';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'work': return 'bg-blue-100 text-blue-800';
      case 'communication': return 'bg-purple-100 text-purple-800';
      case 'learning': return 'bg-indigo-100 text-indigo-800';
      case 'personal': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const updateWeeklyData = (type) => {
    const today = new Date().toLocaleString('en-US', { weekday: 'short' });
    setWeeklyData((prev) =>
      prev.map((day) =>
        day.name === today
          ? { 
              ...day, 
              [type === 'sessions' ? 'sessions' : 'tasks']: day[type === 'sessions' ? 'sessions' : 'tasks'] + 1 
            }
          : day
      )
    );
  };

  const getTotalProductivityTime = () => {
    return completedSessions * workDuration;
  };

  const getWeeklyTasksCompleted = () => {
    return weeklyData.reduce((sum, day) => sum + day.tasks, 0);
  };

  const productivityRate = Math.min(100, Math.round((completedSessions / 30) * 100));

  const exportCompletedTasks = () => {
    const csvContent = "data:text/csv;charset=utf-8,Task,Priority,Category,Due Date,Completed At\n" + 
      completedTasks.map(task => 
        `${task.text},${task.priority},${task.category},${task.dueDate ? new Date(task.dueDate).toLocaleString() : ''},${task.completedAt ? new Date(task.completedAt).toLocaleString() : ''}`
      ).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "completed_tasks.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleMeetingMode = () => {
    setMeetingMode(!meetingMode);
    showNotificationWithTimer(meetingMode ? 'Meeting mode off.' : 'Meeting mode on: Distractions paused.', 'info');
  };

  const openWrapUp = () => {
    setShowWrapUp(true);
  };

  const saveWrapUp = () => {
    if (tomorrowPriority.trim()) {
      showNotificationWithTimer('Tomorrow\'s priority saved!', 'success');
    }
    setShowWrapUp(false);
    setTomorrowPriority('');
  };

  const closeOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('onboardingSeen', 'true');
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark:bg-slate-900 dark:text-white' : 'bg-gradient-to-br from-slate-50 to-slate-100'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                  FocusFlow Pro
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Premium productivity for remote professionals</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {darkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              
              {/* Settings Button */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Timer Settings */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Timer Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Work Session Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={workDuration}
                      onChange={(e) => setWorkDuration(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Short Break Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={breakDuration}
                      onChange={(e) => setBreakDuration(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Long Break Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={longBreakDuration}
                      onChange={(e) => setLongBreakDuration(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Sessions Before Long Break
                    </label>
                    <input
                      type="number"
                      value={sessionsBeforeLongBreak}
                      onChange={(e) => setSessionsBeforeLongBreak(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Blocked Websites */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Blocked Websites
                </h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newSite}
                    onChange={(e) => setNewSite(e.target.value)}
                    placeholder="e.g., facebook.com"
                    className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                    onKeyPress={(e) => e.key === 'Enter' && addBlockedSite()}
                  />
                  <button
                    onClick={addBlockedSite}
                    className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {blockedSites.map((site) => (
                    <div key={site} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                      <span className="text-sm text-red-700 dark:text-red-300 font-medium">{site}</span>
                      <button
                        onClick={() => removeBlockedSite(site)}
                        className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  These websites will be blocked during work sessions to help you stay focused
                </p>
              </div>

              {/* Appearance */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                  </svg>
                  Appearance
                </h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-white">Dark Mode</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Switch between light and dark themes</p>
                  </div>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      darkMode ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        darkMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification System */}
      {showNotification && (
        <div className={`fixed top-20 right-6 z-40 transform transition-all duration-300 animate-in slide-in-from-top-5 fade-in-0 ${
          notificationType === 'success' ? 'bg-green-500' : 
          notificationType === 'break-tip' ? 'bg-blue-500' : 
          notificationType === 'warning' ? 'bg-red-500' : 'bg-slate-800'
        } text-white rounded-xl shadow-lg px-6 py-4 max-w-sm`}>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {notificationType === 'success' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notificationType === 'break-tip' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              )}
              {notificationType === 'warning' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {notificationType === 'info' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <p className="text-sm font-medium">{notificationMessage}</p>
          </div>
        </div>
      )}

      {/* Confetti for task completion */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-30">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-fall"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10px',
                backgroundColor: `hsl(${Math.random() * 360}, 70%, 60%)`,
                width: `${Math.random() * 10 + 5}px`,
                height: `${Math.random() * 10 + 5}px`,
                opacity: Math.random(),
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${Math.random() * 3 + 2}s`
              }}
            />
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 sm:gap-0 mb-8 bg-slate-100 dark:bg-slate-800/50 rounded-xl p-1 w-fit">
          {[
            { id: 'focus', label: 'Focus', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { id: 'tasks', label: 'Tasks', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { id: 'stats', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Focus Tab */}
        {activeTab === 'focus' && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Timer Section */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <div className="mb-6 relative">
                  <div className={`text-8xl font-mono font-bold mb-4 bg-gradient-to-r ${
                    isWorkTime 
                      ? 'from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500' 
                      : 'from-green-500 to-green-600 dark:from-green-400 dark:to-green-500'
                  } bg-clip-text text-transparent ${isRunning ? 'animate-pulse' : ''}`}>
                    {formatTime(timeLeft)}
                  </div>
                  
                  {/* Progress Ring */}
                  <div className="absolute -inset-1 rounded-2xl border-2 border-slate-100 dark:border-slate-700"></div>
                  <div className="absolute -inset-2 rounded-2xl border-2 border-slate-50 dark:border-slate-800"></div>
                  
                  <div className="text-lg font-semibold mb-6">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      isWorkTime 
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    }`}>
                      {isWorkTime ? 'FOCUS TIME' : 'BREAK TIME'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-3 mb-6">
                  {!isRunning ? (
                    <button
                      onClick={startTimer}
                      className="px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl transition-all transform hover:scale-105 font-medium flex items-center justify-center space-x-2 shadow-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Start Focus</span>
                    </button>
                  ) : (
                    <button
                      onClick={pauseTimer}
                      className="px-8 py-4 bg-slate-500 hover:bg-slate-600 text-white rounded-xl transition-colors font-medium flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    onClick={resetTimer}
                    className="px-8 py-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-colors font-medium"
                  >
                    Reset
                  </button>
                </div>

                <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
                  <p>
                    {isWorkTime 
                      ? `Focus for ${workDuration} minutes` 
                      : currentSession > 0 && currentSession % sessionsBeforeLongBreak === 0
                      ? `Long break: ${longBreakDuration} minutes`
                      : `Short break: ${breakDuration} minutes`}
                  </p>
                  <p>Session {currentSession + 1} of {sessionsBeforeLongBreak} before long break</p>
                </div>
              </div>
            </div>

            {/* Distraction Blocker */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center">
                  <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Distraction Blocker
                </h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  isRunning && isWorkTime && !meetingMode
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' 
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  {isRunning && isWorkTime && !meetingMode ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm leading-relaxed">
                FocusFlow automatically blocks distracting websites during your work sessions to help you maintain deep focus and productivity.
              </p>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {blockedSites.map((site) => (
                  <div key={site} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/50">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">{site}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Blocked</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Total blocked sites:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{blockedSites.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Task Management</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Organize your work with priority-based task lists</p>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white min-w-32"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                  
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white min-w-32"
                  >
                    <option value="work">Work</option>
                    <option value="communication">Communication</option>
                    <option value="learning">Learning</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
              </div>

              {/* Add Task */}
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input
                  type="text"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a new task..."
                  className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                />
                <input
                  type="datetime-local"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                  placeholder="Set due date"
                />
                <button
                  onClick={addTask}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors whitespace-nowrap"
                >
                  Add Task
                </button>
              </div>

              {/* Active and Completed Tasks */}
              <div className="space-y-6">
                {/* Active Tasks */}
                <div className="space-y-3">
                  <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2 flex items-center justify-between">
                    Active Tasks ({activeTasks.length})
                  </h4>
                  {activeTasks.length === 0 ? (
                    <p className="text-center py-4 text-slate-500 dark:text-slate-400">No active tasks. Add one to get started!</p>
                  ) : (
                    activeTasks.map((task) => (
                      <div key={task.id} className="group p-4 rounded-xl border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500">
                        {editingTaskId === task.id ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={editTaskText}
                              onChange={(e) => setEditTaskText(e.target.value)}
                              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                              placeholder="Edit task name"
                            />
                            <div className="flex gap-2">
                              <select
                                value={editTaskPriority}
                                onChange={(e) => setEditTaskPriority(e.target.value)}
                                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                              >
                                <option value="high">High Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="low">Low Priority</option>
                              </select>
                              <select
                                value={editTaskCategory}
                                onChange={(e) => setEditTaskCategory(e.target.value)}
                                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                              >
                                <option value="work">Work</option>
                                <option value="communication">Communication</option>
                                <option value="learning">Learning</option>
                                <option value="personal">Personal</option>
                              </select>
                            </div>
                            <input
                              type="datetime-local"
                              value={editTaskDueDate}
                              onChange={(e) => setEditTaskDueDate(e.target.value)}
                              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveTaskEdit(task.id)}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-xl"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => toggleTask(task.id)}
                              className="w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-500 hover:border-green-400 dark:hover:border-green-400 flex-shrink-0"
                            >
                              <svg className="w-3 h-3 text-transparent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-800 dark:text-slate-200">{task.text}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}>
                                  {task.priority}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(task.category)}`}>
                                  {task.category}
                                </span>
                                {task.dueDate && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${new Date(task.dueDate) < new Date() ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                    Due: {new Date(task.dueDate).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEditingTask(task)}
                                className="text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 p-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => removeTask(task.id)}
                                className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 p-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Completed Tasks */}
                <div className="space-y-3">
                  <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2 flex items-center justify-between">
                    Completed Tasks ({completedTasks.length})
                    <button onClick={exportCompletedTasks} className="text-sm text-blue-500 hover:text-blue-600">
                      Export Report
                    </button>
                  </h4>
                  {completedTasks.length === 0 ? (
                    <p className="text-center py-4 text-slate-500 dark:text-slate-400">No completed tasks yet. Keep going!</p>
                  ) : (
                    completedTasks.map((task) => (
                      <div key={task.id} className="group p-4 rounded-xl border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50">
                        {editingTaskId === task.id ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={editTaskText}
                              onChange={(e) => setEditTaskText(e.target.value)}
                              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                              placeholder="Edit task name"
                            />
                            <div className="flex gap-2">
                              <select
                                value={editTaskPriority}
                                onChange={(e) => setEditTaskPriority(e.target.value)}
                                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                              >
                                <option value="high">High Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="low">Low Priority</option>
                              </select>
                              <select
                                value={editTaskCategory}
                                onChange={(e) => setEditTaskCategory(e.target.value)}
                                className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                              >
                                <option value="work">Work</option>
                                <option value="communication">Communication</option>
                                <option value="learning">Learning</option>
                                <option value="personal">Personal</option>
                              </select>
                            </div>
                            <input
                              type="datetime-local"
                              value={editTaskDueDate}
                              onChange={(e) => setEditTaskDueDate(e.target.value)}
                              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveTaskEdit(task.id)}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-xl"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-3">
                            <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-800 dark:text-slate-200 line-through">{task.text}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}>
                                  {task.priority}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(task.category)}`}>
                                  {task.category}
                                </span>
                                {task.dueDate && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${new Date(task.dueDate) < new Date() ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                    Due: {new Date(task.dueDate).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEditingTask(task)}
                                className="text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 p-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => undoComplete(task.id)}
                                className="text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
                              >
                                Undo
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Task Stats and Actions */}
              {activeTasks.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex flex-wrap justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Total tasks: <span className="font-semibold text-slate-800 dark:text-white">{activeTasks.length}</span></span>
                    <span className="text-slate-600 dark:text-slate-400">Completed: <span className="font-semibold text-green-600 dark:text-green-400">{completedTasks.length}</span></span>
                    <span className="text-slate-600 dark:text-slate-400">Completion rate: <span className="font-semibold text-slate-800 dark:text-white">{activeTasks.length > 0 ? Math.round((completedTasks.length / (activeTasks.length + completedTasks.length)) * 100) : 0}%</span></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-8">
            {/* Overview Cards */}
            <div className="grid md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Focus Sessions</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{completedSessions}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">This week</p>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Tasks Completed</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{completedTasks.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">All time</p>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Productivity Rate</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{productivityRate}%</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Weekly average</p>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Hours</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{Math.floor(getTotalProductivityTime() / 60)}</p>
                  </div>
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">This month</p>
              </div>
            </div>

            {/* Weekly Productivity Chart */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Weekly Productivity Trends</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 mb-4">Focus Sessions</h4>
                  <div className="space-y-4">
                    {weeklyData.map((day, index) => (
                      <div key={day.name} className="flex items-center space-x-4">
                        <div className="w-8 text-sm font-medium text-slate-600 dark:text-slate-400">{day.name}</div>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                          <div 
                            className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${Math.max(5, (day.sessions / 6) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 w-12 text-right">{day.sessions}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-medium text-slate-700 dark:text-slate-300 mb-4">Tasks Completed</h4>
                  <div className="space-y-4">
                    {weeklyData.map((day, index) => (
                      <div key={day.name} className="flex items-center space-x-4">
                        <div className="w-8 text-sm font-medium text-slate-600 dark:text-slate-400">{day.name}</div>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                          <div 
                            className="bg-green-500 dark:bg-green-400 h-2 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${Math.max(5, (day.tasks / 10) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 w-12 text-right">{day.tasks}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-between mt-4 text-xs text-slate-500 dark:text-slate-400">
                <span>Daily performance tracking</span>
                <span>{getWeeklyTasksCompleted()} tasks completed this week</span>
              </div>
            </div>

            {/* Motivational Section */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 rounded-2xl shadow-lg p-8 text-white">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Outstanding Progress!</h3>
                  <p className="text-blue-100 mb-4">
                    You've completed {completedSessions} focus sessions and {completedTasks.length} tasks this month. 
                    Your dedication to deep work is building incredible momentum. Keep up the amazing work!
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-white bg-opacity-20">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {productivityRate}% productivity rate
                    </span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-white bg-opacity-20">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {Math.floor(getTotalProductivityTime() / 60)} hours focused
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Meeting Mode Button - Always visible */}
      <div className="fixed bottom-6 right-6 z-20">
        <button
          onClick={toggleMeetingMode}
          className={`px-6 py-3 rounded-xl text-white font-medium shadow-lg transition-all transform hover:scale-105 ${
            meetingMode 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {meetingMode ? 'End Meeting Mode' : 'Start Meeting Mode'}
        </button>
      </div>

      {/* Daily Wrap-Up Modal */}
      {showWrapUp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Daily Wrap-Up</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Completed: {completedTasks.length} tasks
            </p>
            <input
              type="text"
              value={tomorrowPriority}
              onChange={(e) => setTomorrowPriority(e.target.value)}
              placeholder="Top priority for tomorrow"
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl mb-4 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowWrapUp(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={saveWrapUp}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Welcome to FocusFlow Pro!</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Boost your productivity with our Pomodoro timer, task manager, and distraction blocker.
            </p>
            <ul className="text-sm text-slate-600 dark:text-slate-400 mb-4 space-y-2">
              <li>• Track focus sessions with the Pomodoro timer</li>
              <li>• Organize tasks with priorities and due dates</li>
              <li>• Block distracting websites during work</li>
              <li>• View your productivity analytics</li>
            </ul>
            <button
              onClick={closeOnboarding}
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>FocusFlow Pro • Premium productivity for remote professionals • Your data is private and secure</p>
        <p className="mt-1">© 2025 FocusFlow. All rights reserved. Made with ❤️ for remote workers.</p>
      </footer>
    </div>
  );
};

export default App;
