// Adapted from brunopentium/Todo-list, deployed TaskMaster interface (2026-10-08).
// Dashboard, conflicts, planning, configuration and task logic retain the original behavior.
import React, {useState, useEffect, useMemo, useRef} from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {AlertCircle, AlertOctagon, AlertTriangle, Bell, Calendar, CalendarCheck, CalendarClock, CalendarRange, CheckSquare, ChevronDown, ChevronRight, Clock3, Database, Download, Edit2, FastForward, Flag, Layers, LayoutDashboard, ListOrdered, Plus, PlusSquare, Repeat, Settings, SkipForward, StickyNote, Trash2, TrendingUp, Upload, X} from "lucide-react";
        // --- UTILS ---
        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

        const getTodayStr = () => new Date().toISOString().split('T')[0];

        const addDays = (dateStr, days) => {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + days);
            return date.toISOString().split('T')[0];
        };

        const isWeekend = (dateStr) => {
            const day = new Date(dateStr + 'T00:00:00').getDay();
            return day === 0 || day === 6;
        };

        const addBusinessDays = (dateStr, businessDays) => {
            if (businessDays === 0) return dateStr;

            let current = dateStr;
            let remaining = Math.abs(businessDays);
            const direction = businessDays > 0 ? 1 : -1;

            while (remaining > 0) {
                current = addDays(current, direction);
                if (!isWeekend(current)) {
                    remaining -= 1;
                }
            }

            return current;
        };

        const getNextBusinessDay = (dateStr) => {
            return isWeekend(dateStr) ? addBusinessDays(dateStr, 1) : dateStr;
        };

        const getStartOfWeek = (dateStr) => {
            const date = new Date(dateStr + 'T00:00:00');
            const day = date.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            return addDays(dateStr, diffToMonday);
        };

        const getBusinessDayShift = (fromDateStr, toDateStr) => {
            if (!fromDateStr || !toDateStr || toDateStr <= fromDateStr) return 0;

            let current = fromDateStr;
            let shift = 0;

            while (current < toDateStr) {
                current = addBusinessDays(current, 1);
                shift += 1;
            }

            return shift;
        };

        const getBusinessDayDistance = (fromDateStr, toDateStr) => {
            if (!fromDateStr || !toDateStr || fromDateStr === toDateStr) return 0;

            const step = toDateStr > fromDateStr ? 1 : -1;
            let current = fromDateStr;
            let distance = 0;

            while (current !== toDateStr) {
                current = addDays(current, step);
                if (!isWeekend(current)) {
                    distance += step;
                }
            }

            return distance;
        };

        const getEffectiveDate = (task) => {
            if (!task?.date) return '';
            if (task.status === 'Recorrente') return task.date;

            const delay = Number(task.deferBusinessDays) || 0;
            if (!delay) return task.date;

            return addBusinessDays(task.date, delay);
        };

        const formatDate = (year, month, day) => {
            const date = new Date(Date.UTC(year, month, day));
            return date.toISOString().split('T')[0];
        };

        const getDaysInMonth = (year, month) => {
            return new Date(year, month + 1, 0).getDate();
        };

const iconComponents={'alert-circle':AlertCircle,'alert-octagon':AlertOctagon,'alert-triangle':AlertTriangle,'bell':Bell,'calendar':Calendar,'calendar-check':CalendarCheck,'calendar-clock':CalendarClock,'calendar-range':CalendarRange,'check-square':CheckSquare,'chevron-down':ChevronDown,'chevron-right':ChevronRight,'clock-3':Clock3,'database':Database,'download':Download,'edit-2':Edit2,'fast-forward':FastForward,'flag':Flag,'layers':Layers,'layout-dashboard':LayoutDashboard,'list-ordered':ListOrdered,'plus':Plus,'plus-square':PlusSquare,'repeat':Repeat,'settings':Settings,'skip-forward':SkipForward,'sticky-note':StickyNote,'trash-2':Trash2,'trending-up':TrendingUp,'upload':Upload,'x':X};
const Icon=({name,size=20,className=""})=>{const Component=iconComponents[name];return Component?<Component size={size} className={className} aria-hidden="true"/>:null};
        const DEFAULT_PROJECT = 'R&D';

        const SECONDARY_FIELDS = ['project', 'priority', 'difficulty', 'deadline'];
        const DEFAULT_SECONDARY_SORT = SECONDARY_FIELDS.map(field => ({ field, direction: 'asc' }));

        const defaultConfig = {
            alertYellow: 7,
            alertOrange: 3,
            alertRed: 1,
            overdueColor: 'border-l-slate-900',
            todayBg: '#fef9c3',
            tomorrowBg: '#ffedd5',
            deadlineBg: '#fee2e2',
            projectPriorities: {},
            secondarySortLevels: DEFAULT_SECONDARY_SORT
        };

        const defaultRecurrence = {
            frequency: 'Nenhuma',
            daysOfWeek: [],
            daysOfMonth: []
        };

        const STATUS_OPTIONS = ['Em Andamento', 'Reserva', 'Recorrente', 'Concluída', 'Cancelada'];

        const STATUS_COLORS = {
            'Pendente': 'bg-slate-200 text-slate-700',
            'Em Andamento': 'bg-blue-100 text-blue-700',
            'Concluída': 'bg-green-100 text-green-700',
            'Cancelada': 'bg-red-100 text-red-700',
            'Recorrente': 'bg-purple-100 text-purple-700'
        };

        const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        // --- COMPONENTS ---

        // 1. STATUS BADGE
        const StatusBadge = ({ status, onClick, className = '' }) => {
            const Element = onClick ? 'button' : 'span';
            return (
                <Element
                    type={onClick ? 'button' : undefined}
                    onClick={onClick}
                    className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[status] || STATUS_COLORS['Pendente']} ${onClick ? 'cursor-pointer hover:opacity-90 transition' : ''} ${className}`}
                >
                    {status}
                </Element>
            );
        };

        // 2. RATING DISPLAY / EDITOR (Priority/Difficulty)
        const RatingDisplay = ({ value, max = 5, color = "text-yellow-500", onChange, label }) => {
            return (
                <div className="flex items-center gap-1">
                    {label && <span className="font-semibold text-slate-500">{label}</span>}
                    <div className="flex space-x-0.5">
                        {[...Array(max)].map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => onChange && onChange(i + 1)}
                                className={`text-xs leading-none ${i < value ? color : "text-slate-300"} ${onChange ? 'hover:scale-110 transition-transform' : ''}`}
                                aria-label={onChange ? `${label || 'Nível'} ${i + 1}` : undefined}
                            >
                                ●
                            </button>
                        ))}
                    </div>
                </div>
            );
        };

        const PostponeSelector = ({ baseDate, onShift, disabled = false }) => {
            const pastDays = 7;
            const futureDays = 14;
            const referenceDate = baseDate || getTodayStr();

            const offsets = useMemo(
                () => [...Array(pastDays + futureDays + 1)].map((_, i) => i - pastDays),
                [referenceDate]
            );

            const handleSelect = (offset) => {
                if (disabled || offset === 0) return;
                if (onShift) onShift(offset);
            };

            return (
                <div className="flex items-center gap-1" title="Ajustar data de execução por dia da semana">
                    <span className="text-[11px] font-semibold text-slate-500">Reagendar:</span>
                    <div className="flex items-center gap-1 overflow-x-auto flex-nowrap">
                        {offsets.map((offset) => {
                            const targetDate = addDays(referenceDate, offset);
                            const weekdayIndex = new Date(targetDate + 'T00:00:00').getDay();
                            const weekdayLabel = WEEKDAY_LABELS[weekdayIndex];
                            const isWeekendDay = weekdayIndex === 0 || weekdayIndex === 6;
                            const isCurrent = offset === 0;
                            const description = offset === 0
                                ? 'Data atual de execução'
                                : `${offset > 0 ? 'Adiar' : 'Adiantar'} para ${targetDate.split('-').reverse().join('/')}`;

                            const colorClasses = isWeekendDay
                                ? 'text-red-500 hover:text-red-600'
                                : isCurrent
                                    ? 'text-blue-700'
                                    : 'text-slate-600 hover:text-blue-600';

                            return (
                                <button
                                    key={offset}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => handleSelect(offset)}
                                    className={`min-w-[22px] h-5 text-[10px] font-semibold rounded border leading-none flex items-center justify-center transition-colors ${isCurrent ? 'bg-blue-50 border-blue-400 shadow-sm' : 'border-slate-200 hover:border-blue-300'} ${colorClasses} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                    aria-label={description}
                                    title={description}
                                >
                                    {weekdayLabel}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        };

        // 3. MAIN APP
        function App() {
            // --- STATE ---
            const [tasks, setTasks] = useState([]);
            const [initialLoad, setInitialLoad] = useState(false);
            const [storageError, setStorageError] = useState('');
            const [storageRevision, setStorageRevision] = useState(0);
            const normalizeProjectName = (name) => name === 'Geral' ? DEFAULT_PROJECT : (name || DEFAULT_PROJECT);
            const ensureDefaultProject = (list) => {
                const sanitized = list.map(p => normalizeProjectName(p)).filter(Boolean);
                const unique = Array.from(new Set(sanitized));
                const withoutDefault = unique.filter(p => p !== DEFAULT_PROJECT);
                return [DEFAULT_PROJECT, ...withoutDefault];
            };

            const [projects, setProjects] = useState([DEFAULT_PROJECT, 'Pessoal', 'Trabalho']);
            const [view, setView] = useState('dashboard'); // dashboard, settings, conflicts, planner
            const [modalOpen, setModalOpen] = useState(false);
            const [editingTask, setEditingTask] = useState(null);
            const [expandedSubtasks, setExpandedSubtasks] = useState({});
            const [expandedNotes, setExpandedNotes] = useState({});
            const [editingDateId, setEditingDateId] = useState(null);
            const [editingDeadlineId, setEditingDeadlineId] = useState(null);
            const inlineDateInput = useRef(null);
            const inlineDeadlineInput = useRef(null);
            const showDatePicker = (input) => {
                if (!input) return;
                try { input.showPicker?.(); } catch { /* Keep the native date input usable in browsers without picker access. */ }
            };
            const openInlineDate = (taskId, field) => {
                // Mount the input inside the original click, preserving the user activation required by showPicker.
                flushSync(() => {
                    setEditingDateId(field === 'date' ? taskId : null);
                    setEditingDeadlineId(field === 'deadline' ? taskId : null);
                });
                showDatePicker(field === 'date' ? inlineDateInput.current : inlineDeadlineInput.current);
            };
            const [editingTitleId, setEditingTitleId] = useState(null);
            const [titleDrafts, setTitleDrafts] = useState({});
            const [statusMenuTask, setStatusMenuTask] = useState(null);
            const [inlineSubtaskText, setInlineSubtaskText] = useState({});
            const [editingSubtask, setEditingSubtask] = useState(null);
            const [subtaskDrafts, setSubtaskDrafts] = useState({});
            const [reprogramOffset, setReprogramOffset] = useState('');
            const [weeklyPlan, setWeeklyPlan] = useState({});
            const [groupPlannerByProject, setGroupPlannerByProject] = useState(false);

            // Configurações padrão
            const [config, setConfig] = useState(defaultConfig);

            const [filters, setFilters] = useState({
                project: 'Todos',
                status: 'Aberta',
                search: '',
                dateFilter: 'Todos',
                startDate: '',
                endDate: ''
            });

            const normalizeTask = (task) => ({
                ...task,
                project: normalizeProjectName(task.project),
                status: task.status === 'Pendente' ? 'Em Andamento' : task.status,
                recurrence: { ...defaultRecurrence, ...(task.recurrence || {}) },
                deferBusinessDays: Number(task.deferBusinessDays) || 0
            });

            const toggleNotesVisibility = (taskId) => {
                setExpandedNotes(prev => ({ ...prev, [taskId]: !prev[taskId] }));
            };

            const getNextRecurrenceDate = (task) => {
                const recurrence = { ...defaultRecurrence, ...(task.recurrence || {}) };
                if (task.status !== 'Recorrente' || recurrence.frequency === 'Nenhuma') return null;

                const baseDate = task.date || getTodayStr();

                if (recurrence.frequency === 'Diária') {
                    return addDays(baseDate, 1);
                }

                if (recurrence.frequency === 'Semanal') {
                    const days = (recurrence.daysOfWeek || []).map(Number);
                    if (days.length === 0) return null;
                    for (let i = 1; i <= 14; i++) {
                        const candidateStr = addDays(baseDate, i);
                        const day = new Date(candidateStr + 'T00:00:00').getDay();
                        if (days.includes(day)) return candidateStr;
                    }
                    return null;
                }

                if (recurrence.frequency === 'Mensal') {
                    const days = (recurrence.daysOfMonth || [])
                        .map(Number)
                        .filter(d => d >= 1 && d <= 31)
                        .sort((a, b) => a - b);

                    if (days.length === 0) return null;

                    const currentDate = new Date(baseDate + 'T00:00:00');
                    const currentDay = currentDate.getDate();
                    const year = currentDate.getFullYear();
                    const month = currentDate.getMonth();
                    const daysInMonth = getDaysInMonth(year, month);

                    const nextDaySameMonth = days.find(d => d > currentDay && d <= daysInMonth);
                    if (nextDaySameMonth) {
                        return formatDate(year, month, nextDaySameMonth);
                    }

                    let nextMonth = month + 1;
                    let nextYear = year;
                    if (nextMonth > 11) {
                        nextMonth = 0;
                        nextYear += 1;
                    }

                    const nextMonthDays = getDaysInMonth(nextYear, nextMonth);
                    const validDay = days.find(d => d <= nextMonthDays) || nextMonthDays;
                    return formatDate(nextYear, nextMonth, validDay);
                }

                return null;
            };

            const recurrenceDescription = (recurrence) => {
                const data = { ...defaultRecurrence, ...(recurrence || {}) };
                if (data.frequency === 'Diária') return 'Diária';
                if (data.frequency === 'Semanal') {
                    const days = (data.daysOfWeek || []).map(Number).sort((a, b) => a - b);
                    if (!days.length) return 'Semanal';
                    return `Semanal (${days.map(d => WEEKDAY_LABELS[d]).join(', ')})`;
                }
                if (data.frequency === 'Mensal') {
                    const days = (data.daysOfMonth || []).map(Number).filter(Boolean).sort((a, b) => a - b);
                    if (!days.length) return 'Mensal';
                    return `Mensal (dias ${days.join(', ')})`;
                }
                return 'Sem recorrência';
            };

            // The original TaskMaster interface uses the Gantt's local store.
            useEffect(() => {
                const applyData = (response) => {
                    // A source restored by Meu dia must not leave an older form open.
                    setModalOpen(false);setEditingTask(null);
                    const serverTasks = response.tasks.map(t => normalizeTask(t));
                    const storedSettings = response.settings || {};
                    const derivedProjects = ensureDefaultProject([
                        ...(storedSettings.projects || []), ...serverTasks.map(t => t.project)
                    ]);
                    const parsedConfig = {...defaultConfig, ...(storedSettings.config || {})};
                    const projectPriorities = Object.fromEntries(Object.entries(parsedConfig.projectPriorities || {}).map(([key,value])=>[normalizeProjectName(key),value]));
                    setTasks(serverTasks);setProjects(derivedProjects);
                    setConfig({...parsedConfig,projectPriorities,secondarySortLevels:normalizeSecondarySortLevels(parsedConfig.secondarySortLevels)});
                    setStorageRevision(response._revision);setInitialLoad(true);setStorageError('');
                };
                try { applyData(TaskBackend.read()); }
                catch(error) { setStorageError(error.message); }
                return TaskBackend.subscribe(applyData);
            }, []);

            // A parent save/export can flush the latest committed React render.
            if(initialLoad) window.TaskMaster={
                snapshot:()=>({tasks,settings:{config,projects},_revision:storageRevision}),
                openTask:(id)=>{
                    const task=tasks.find(t=>String(t.id)===String(id));
                    if(!task)return false;
                    setView('dashboard');
                    setFilters({project:'Todos',status:'Todos',search:'',dateFilter:'Todos',startDate:'',endDate:''});
                    setEditingTask(task);setModalOpen(true);return true;
                }
            };
            useEffect(() => {
                if(!initialLoad)return;
                try { TaskBackend.write({tasks,settings:{config,projects},_revision:storageRevision});setStorageError(''); }
                catch(error) { setStorageError('As alterações não foram gravadas: '+error.message); }
            },[tasks,projects,config,initialLoad,storageRevision]);

            // --- LOGIC ---

            const getDeadlineLevel = (task) => {
                if (task.status === 'Recorrente') return null;
                if (task.status === 'Concluída' || task.status === 'Cancelada' || task.status === 'Reserva' || !task.deadline) return null;

                const todayStr = getTodayStr();

                if (task.deadline < todayStr) return 'overdue';

                const diffBusinessDays = getBusinessDayDistance(todayStr, task.deadline);

                if (diffBusinessDays <= config.alertRed) return 'red';
                if (diffBusinessDays <= config.alertOrange) return 'orange';
                if (diffBusinessDays <= config.alertYellow) return 'yellow';
                return null;
            };

        const getAlertLevel = (task) => {
            if (task.status === 'Recorrente') return 'border-l-8 border-l-slate-400';
 if (task.status === 'Reserva') return 'border-l-8 border-l-amber-300';
            const level = getDeadlineLevel(task);
            if (!level) return 'border-l-4 border-l-blue-400';

                const map = {
                    overdue: `border-l-8 ${config.overdueColor}`,
                    red: 'border-l-8 border-l-red-500',
                    orange: 'border-l-8 border-l-orange-400',
                    yellow: 'border-l-8 border-l-yellow-400'
                };
                return map[level] || 'border-l-4 border-l-blue-400';
            };

        const getProjectPriorityValue = (projectName) => {
            const value = config.projectPriorities?.[projectName];
            if (value === '' || value === undefined || value === null) return -Infinity;
            const numeric = Number(value);
            return Number.isNaN(numeric) ? -Infinity : numeric;
        };

        const SECONDARY_FIELD_LABELS = {
            project: 'Projeto (prioridade)',
            priority: 'Prioridade',
            difficulty: 'Dificuldade',
            deadline: 'Deadline'
        };

        const normalizeSecondarySortLevels = (levels = DEFAULT_SECONDARY_SORT) => {
            const input = Array.isArray(levels) && levels.length ? levels : DEFAULT_SECONDARY_SORT;

            const mapped = input.map((entry, idx) => {
                if (typeof entry === 'string') return { field: entry, direction: 'asc' };
                const field = SECONDARY_FIELDS.includes(entry?.field)
                    ? entry.field
                    : (SECONDARY_FIELDS[idx] || SECONDARY_FIELDS[0]);
                const direction = entry?.direction === 'desc' ? 'desc' : 'asc';
                return { field, direction };
            });

            const ordered = [];
            mapped.forEach(item => {
                if (!item || !SECONDARY_FIELDS.includes(item.field)) return;
                if (ordered.some(o => o.field === item.field)) return;
                ordered.push(item);
            });

            SECONDARY_FIELDS.forEach(field => {
                if (!ordered.some(o => o.field === field)) {
                    ordered.push({ field, direction: 'asc' });
                }
            });

            return ordered.slice(0, SECONDARY_FIELDS.length);
        };

        const compareDates = (dateA, dateB) => {
            if (dateA && dateB && dateA !== dateB) return dateA > dateB ? 1 : -1;
            if (!dateA && dateB) return 1;
            if (dateA && !dateB) return -1;
            return 0;
        };

        const compareByField = (field, a, b) => {
            switch (field) {
                case 'project': {
                    const priorityDiff = getProjectPriorityValue(a.project) - getProjectPriorityValue(b.project);
                    if (priorityDiff !== 0) return priorityDiff;
                    return a.project.localeCompare(b.project);
                }
                case 'priority':
                    return (a.priority || 0) - (b.priority || 0);
                case 'difficulty':
                    return (Number(a.difficulty) || 0) - (Number(b.difficulty) || 0);
                case 'deadline':
                    return compareDates(a.deadline, b.deadline);
                default:
                    return 0;
            }
        };

        const compareTasks = (a, b) => {
            const primary = compareDates(getEffectiveDate(a), getEffectiveDate(b));
            if (primary !== 0) return primary;

            const secondaryOrder = normalizeSecondarySortLevels(config.secondarySortLevels);

            for (const { field, direction } of secondaryOrder) {
                if (!SECONDARY_FIELDS.includes(field)) continue;
                const result = compareByField(field, a, b);
                if (result !== 0) return direction === 'desc' ? -result : result;
            }

            return a.title.localeCompare(b.title);
        };

        const updateProjectPriority = (projectName, value) => {
            setConfig(prev => {
                const updated = { ...(prev.projectPriorities || {}) };
                if (value === '' || Number.isNaN(value)) {
                    delete updated[projectName];
                } else {
                    updated[projectName] = value;
                }
                return { ...prev, projectPriorities: updated };
            });
        };

        const updateSecondarySortLevel = (index, field) => {
            setConfig(prev => {
                const current = normalizeSecondarySortLevels(prev.secondarySortLevels);
                const updated = current.map((item, idx) => idx === index ? { ...item, field } : item);
                return { ...prev, secondarySortLevels: normalizeSecondarySortLevels(updated) };
            });
        };

        const updateSecondarySortDirection = (index, direction) => {
            setConfig(prev => {
                const current = normalizeSecondarySortLevels(prev.secondarySortLevels);
                const updated = current.map((item, idx) => idx === index ? { ...item, direction } : item);
                return { ...prev, secondarySortLevels: normalizeSecondarySortLevels(updated) };
            });
        };

        const updateTaskField = (id, field, value) => {
            setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
        };

        const adjustTaskExecutionDate = (id, dayShift) => {
            if (!dayShift) return;

            setTasks(prev => prev.map(t => {
                if (t.id !== id) return t;
                const baseDate = getEffectiveDate(t) || getTodayStr();
                return {
                    ...t,
                    date: addDays(baseDate, dayShift),
                    deferBusinessDays: 0
                };
            }));
        };

        const advanceRecurrence = (task) => {
            const nextDate = getNextRecurrenceDate(task);
            if (!nextDate) {
                alert('Configure a recorrência desta tarefa para avançar.');
                    return;
                }
                updateTaskField(task.id, 'date', nextDate);
            };

            const saveTask = (task) => {
                const normalized = normalizeTask(task);

                if (task.id) {
                    setTasks(tasks.map(t => t.id === task.id ? normalized : t));
                } else {
                    setTasks([...tasks, { ...normalized, id: generateId() }]);
                }
                // Adicionar projeto se for novo
                if (!projects.includes(task.project)) {
                    setProjects(ensureDefaultProject([...projects, task.project]));
                }
                setModalOpen(false);
                setEditingTask(null);
            };

            const deleteProject = (projectName) => {
                const hasActiveTasks = tasks.some(t => t.project === projectName && (t.status === 'Em Andamento' || t.status === 'Recorrente'));
                if (hasActiveTasks) {
                    alert('Não é possível excluir projetos com tarefas em andamento ou recorrentes.');
                    return;
                }

                if (!confirm(`Deseja excluir o projeto "${projectName}"?`)) return;

                setProjects(prev => ensureDefaultProject(prev.filter(p => p !== projectName)));
                setTasks(prev => prev.map(t => t.project === projectName ? { ...t, project: DEFAULT_PROJECT } : t));
                setFilters(prev => prev.project === projectName ? { ...prev, project: 'Todos' } : prev);
                setEditingTask(prev => prev && prev.project === projectName ? { ...prev, project: DEFAULT_PROJECT } : prev);
            };

            const deleteTask = (id) => {
                if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
                    setTasks(tasks.filter(t => t.id !== id));
                }
            };

            const toggleSubtask = (taskId, subIndex) => {
                const newTasks = tasks.map(t => {
                    if (t.id === taskId) {
                        const newSub = [...t.subtasks];
                        newSub[subIndex].completed = !newSub[subIndex].completed;
                        return { ...t, subtasks: newSub };
                    }
                    return t;
                });
                setTasks(newTasks);
            };

            const shiftAllTasks = (days, useBusinessDays = true) => {
                if (days === 0 || Number.isNaN(days)) return;

                const absDays = Math.abs(days);
                const unitLabel = useBusinessDays ? (absDays === 1 ? 'dia útil' : 'dias úteis') : (absDays === 1 ? 'dia' : 'dias');
                const directionLabel = days > 0 ? 'adiar' : 'antecipar';

                if (!confirm(`Deseja ${directionLabel} todas as tarefas pendentes em ${absDays} ${unitLabel}?`)) return;

                const shiftDate = (dateStr) => useBusinessDays ? addBusinessDays(dateStr, parseInt(days)) : addDays(dateStr, parseInt(days));

                const fallbackDate = getNextBusinessDay(getTodayStr());

                const newTasks = tasks.map(t => {
                    if (!['Concluída', 'Cancelada', 'Reserva'].includes(t.status)) {
                        const baseDate = t.date || fallbackDate;
                        return { ...t, date: shiftDate(baseDate) };
                    }
                    return t;
                });
                setTasks(newTasks);
                alert('Tarefas reprogramadas com sucesso!');
            };

            const shiftTasksFromEarliest = (targetDateStr, label) => {
                const pendingTasks = tasks.filter(t => !['Concluída', 'Cancelada', 'Reserva'].includes(t.status));
                if (pendingTasks.length === 0) {
                    alert('Não há tarefas pendentes para reprogramar.');
                    return;
                }

                const earliestDate = pendingTasks.reduce((earliest, task) => {
                    if (!task.date) return earliest;
                    if (!earliest || task.date < earliest) return task.date;
                    return earliest;
                }, null);

                if (!earliestDate) {
                    alert('Não há datas definidas para reprogramar.');
                    return;
                }

                const shift = getBusinessDayShift(earliestDate, targetDateStr);

                if (shift === 0) {
                    alert('As tarefas já estão alinhadas com a data escolhida.');
                    return;
                }

                if (!confirm(`Deseja reprogramar todas as tarefas pendentes para começar ${label}?`)) return;

                const fallbackDate = getNextBusinessDay(getTodayStr());

                const newTasks = tasks.map(t => {
                    if (!['Concluída', 'Cancelada', 'Reserva'].includes(t.status)) {
                        const baseDate = t.date || fallbackDate;
                        return { ...t, date: addBusinessDays(baseDate, shift) };
                    }
                    return t;
                });

                setTasks(newTasks);
                alert('Tarefas reprogramadas com sucesso!');
            };

            const exportData = () => {
                const dataStr = JSON.stringify({tasks, projects, config});
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                const exportFileDefaultName = 'backup_tarefas.json';
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
            };

            const importData = (event) => {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = TaskBackend.parseBackup(JSON.parse(e.target.result));
                        TaskBackend.restore(data);
                        alert('Backup restaurado com sucesso!');
                    } catch (err) {
                        alert('Erro ao ler arquivo: '+err.message);
                    }
                };
                reader.readAsText(file);
            };

            // --- FILTRAGEM ---
            const todayStr = getTodayStr();
            const tomorrowStr = addDays(todayStr, 1);
            const businessToday = getNextBusinessDay(todayStr);
            const businessTomorrow = addBusinessDays(businessToday, 1);
            const weekOptions = useMemo(() => (
                [
                    { label: 'Semana Atual', offset: 0 },
                    { label: 'Próxima 1', offset: 1 },
                    { label: 'Próxima 2', offset: 2 },
                    { label: 'Próxima 3', offset: 3 },
                ]
            ), []);
            const weekdayCompactLabels = ['S', 'T', 'Q', 'Q', 'S'];

            const filteredTasks = useMemo(() => {
                return tasks.filter(t => {
                    const executionDate = getEffectiveDate(t);
                    const matchProj = filters.project === 'Todos' || t.project === filters.project;
                    const matchStatus = filters.status === 'Todos'
                        || (filters.status === 'Aberta' ? ['Em Andamento', 'Recorrente'].includes(t.status) : t.status === filters.status);
                    const matchSearch = t.title.toLowerCase().includes(filters.search.toLowerCase());
                    let matchDate = true;

                    if (filters.dateFilter === 'Hoje') {
                        matchDate = executionDate === todayStr;
                    } else if (filters.dateFilter === 'Amanhã') {
                        matchDate = executionDate === tomorrowStr;
                    } else if (filters.dateFilter === 'Período') {
                        if (filters.startDate && executionDate && executionDate < filters.startDate) matchDate = false;
                        if (filters.endDate && executionDate && executionDate > filters.endDate) matchDate = false;
                    }

                    return matchProj && matchStatus && matchSearch && matchDate;
                }).sort(compareTasks);
            }, [tasks, filters, todayStr, tomorrowStr, config]);

            const activeProjects = useMemo(() => {
                const names = tasks
                    .filter(t => !['Concluída', 'Cancelada', 'Reserva'].includes(t.status))
                    .map(t => normalizeProjectName(t.project));
                return Array.from(new Set(names));
            }, [tasks]);

            const stats = {
                today: tasks.filter(t => getEffectiveDate(t) === todayStr && !['Concluída', 'Cancelada', 'Reserva'].includes(t.status)).length,
                tomorrow: tasks.filter(t => getEffectiveDate(t) === tomorrowStr && !['Concluída', 'Cancelada', 'Reserva'].includes(t.status)).length,
                late: tasks.filter(t => {
                    const executionDate = getEffectiveDate(t);
                    return executionDate && executionDate < todayStr && !['Concluída', 'Cancelada', 'Reserva'].includes(t.status);
                }).length,
                alertOrange: tasks.filter(t => getDeadlineLevel(t) === 'orange').length,
                alertRed: tasks.filter(t => ['red', 'overdue'].includes(getDeadlineLevel(t))).length
            };

            const secondarySortLevels = useMemo(
                () => normalizeSecondarySortLevels(config.secondarySortLevels),
                [config.secondarySortLevels]
            );

            const isPendingTask = (task) => !['Concluída', 'Cancelada', 'Reserva'].includes(task.status);

            const planningTasks = useMemo(
                () => tasks.filter(isPendingTask).sort(compareTasks),
                [tasks]
            );

            const planningTasksByProject = useMemo(() => {
                const groups = planningTasks.reduce((acc, task) => {
                    const projectName = task.project || DEFAULT_PROJECT;
                    if (!acc[projectName]) acc[projectName] = [];
                    acc[projectName].push(task);
                    return acc;
                }, {});

                return Object.entries(groups)
                    .map(([projectName, projectTasks]) => ({
                        projectName,
                        projectTasks,
                    }))
                    .sort((a, b) => a.projectName.localeCompare(b.projectName));
            }, [planningTasks]);

            const isExecutionAfterDeadline = (task) => {
                if (task.status === 'Recorrente') return false;
                const executionDate = getEffectiveDate(task);
                return task.deadline && executionDate && executionDate > task.deadline;
            };

            const getConflictReasons = (task) => {
                const reasons = [];

                const executionDate = getEffectiveDate(task);

                if (task.status === 'Recorrente' && executionDate && executionDate < todayStr) {
                    reasons.push('Recorrência vencida');
                }

                const deadlineLevel = getDeadlineLevel(task);
                if (deadlineLevel === 'overdue') {
                    reasons.push('Deadline alcançado');
                } else if (deadlineLevel === 'red') {
                    reasons.push('Alerta vermelho de deadline');
                } else if (deadlineLevel === 'orange') {
                    reasons.push('Alerta laranja de deadline');
                }

                if (isPendingTask(task) && executionDate && executionDate < todayStr) {
                    reasons.push('Tarefa atrasada');
                }

                if (isExecutionAfterDeadline(task)) {
                    reasons.push('Execução após deadline');
                }

                return [...new Set(reasons)];
            };

            const conflictTasks = useMemo(() => {
                return tasks
                    .map(task => ({ task, reasons: getConflictReasons(task) }))
                    .filter(item => item.reasons.length > 0);
            }, [tasks, todayStr, config]);

            const selectWeekForTask = (taskId, weekOffset) => {
                setWeeklyPlan(prev => {
                    const current = prev[taskId] || {};
                    const nextWeekday = typeof current.weekday === 'number' ? current.weekday : 0;
                    return { ...prev, [taskId]: { weekOffset, weekday: nextWeekday } };
                });
            };

            const selectDayForTask = (taskId, weekOffset, weekday) => {
                setWeeklyPlan(prev => ({ ...prev, [taskId]: { weekOffset, weekday } }));
            };

            const applyWeeklyPlan = () => {
                const selectable = Object.entries(weeklyPlan).filter(([, plan]) => typeof plan?.weekOffset === 'number' && typeof plan?.weekday === 'number');
                if (!selectable.length) {
                    alert('Selecione uma semana e um dia para pelo menos uma tarefa.');
                    return;
                }

                const baseMonday = getStartOfWeek(todayStr);
                setTasks(prev => prev.map(task => {
                    const plan = weeklyPlan[task.id];
                    if (!plan || typeof plan.weekOffset !== 'number' || typeof plan.weekday !== 'number') return task;
                    const targetMonday = addDays(baseMonday, plan.weekOffset * 7);
                    const newDate = addDays(targetMonday, plan.weekday);
                    return { ...task, date: newDate, deferBusinessDays: 0 };
                }));
            };

            const renderPlannerRow = (task) => {
                const selection = weeklyPlan[task.id] || {};
                return (
                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 align-top font-semibold text-slate-700">{task.project}</td>
                        <td className="px-4 py-3 align-top text-slate-800">{task.title}</td>
                        {weekOptions.map(option => {
                            const isWeekSelected = selection.weekOffset === option.offset;
                            return (
                                <td key={option.offset} className="px-3 py-3 align-top">
                                    <button
                                        type="button"
                                        onClick={() => selectWeekForTask(task.id, option.offset)}
                                        className={`w-full text-xs font-bold border rounded-md px-2 py-1 transition ${isWeekSelected ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-sm' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        {option.label}
                                    </button>
                                    <div className="flex justify-center gap-1 mt-2">
                                        {weekdayCompactLabels.map((dayLabel, idx) => {
                                            const isDaySelected = isWeekSelected && selection.weekday === idx;
                                            return (
                                                <button
                                                    key={`${task.id}-${option.offset}-${idx}`}
                                                    type="button"
                                                    onClick={() => selectDayForTask(task.id, option.offset, idx)}
                                                    className={`w-7 h-7 text-[11px] font-bold rounded border transition ${isDaySelected ? 'bg-emerald-500 text-white border-emerald-500' : isWeekSelected ? 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                                                >
                                                    {dayLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </td>
                            );
                        })}
                    </tr>
                );
            };

            const getCardBackground = (task) => {
                const executionDate = getEffectiveDate(task);
                if (task.status !== 'Recorrente') {
                    if (task.deadline && task.deadline < todayStr && task.status !== 'Concluída' && task.status !== 'Cancelada') {
                        return { backgroundColor: config.deadlineBg };
                    }
                }
                if (executionDate === todayStr) return { backgroundColor: config.todayBg };
                if (executionDate === tomorrowStr) return { backgroundColor: config.tomorrowBg };
                return {};
            };

            const toggleSubtasksVisibility = (taskId) => {
                setExpandedSubtasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
            };

            const startTitleEdit = (task) => {
                setEditingTitleId(task.id);
                setTitleDrafts(prev => ({ ...prev, [task.id]: task.title }));
            };

            const saveTitleEdit = (task) => {
                const newTitle = (titleDrafts[task.id] || '').trim();
                if (newTitle) {
                    updateTaskField(task.id, 'title', newTitle);
                }
                setEditingTitleId(null);
            };

            const cancelTitleEdit = (task) => {
                setTitleDrafts(prev => ({ ...prev, [task.id]: task.title }));
                setEditingTitleId(null);
            };

            const toggleStatusMenu = (taskId) => {
                setStatusMenuTask(prev => prev === taskId ? null : taskId);
            };

            const changeStatus = (taskId, status) => {
                updateTaskField(taskId, 'status', status);
                setStatusMenuTask(null);
            };

            const addInlineSubtask = (taskId) => {
                const text = (inlineSubtaskText[taskId] || '').trim();
                if (!text) return;
                setTasks(prev => prev.map(t => t.id === taskId ? {
                    ...t,
                    subtasks: [...(t.subtasks || []), { text, completed: false }]
                } : t));
                setInlineSubtaskText(prev => ({ ...prev, [taskId]: '' }));
                setExpandedSubtasks(prev => ({ ...prev, [taskId]: true }));
            };

            const quickAddSubtask = (taskId) => {
                let createdIndex = null;
                setTasks(prev => prev.map(t => {
                    if (t.id === taskId) {
                        const newSubtasks = [...(t.subtasks || []), { text: 'Nova subtarefa', completed: false }];
                        createdIndex = newSubtasks.length - 1;
                        return { ...t, subtasks: newSubtasks };
                    }
                    return t;
                }));
                setExpandedSubtasks(prev => ({ ...prev, [taskId]: true }));
                if (createdIndex !== null) {
                    setSubtaskDrafts(prev => ({ ...prev, [`${taskId}-${createdIndex}`]: 'Nova subtarefa' }));
                    setEditingSubtask({ taskId, index: createdIndex });
                }
            };

            const startEditingSubtask = (taskId, index, currentText) => {
                setEditingSubtask({ taskId, index });
                setSubtaskDrafts(prev => ({ ...prev, [`${taskId}-${index}`]: currentText }));
            };

            const saveEditingSubtask = (taskId, index) => {
                const key = `${taskId}-${index}`;
                const newText = (subtaskDrafts[key] || '').trim();
                if (!newText) {
                    setEditingSubtask(null);
                    return;
                }
                setTasks(prev => prev.map(t => {
                    if (t.id === taskId) {
                        const newSub = [...(t.subtasks || [])];
                        newSub[index] = { ...newSub[index], text: newText };
                        return { ...t, subtasks: newSub };
                    }
                    return t;
                }));
                setEditingSubtask(null);
            };

            const renderTaskCard = (task, conflictReasons = []) => {
                const cardBgStyle = getCardBackground(task);
                const executionDate = getEffectiveDate(task);
                const postponeDays = Number(task.deferBusinessDays) || 0;
                const executionLabel = executionDate
                    ? (executionDate === todayStr
                        ? 'Hoje'
                        : (executionDate === tomorrowStr
                            ? 'Amanhã'
                            : executionDate.split('-').reverse().join('/')))
                    : 'Sem data';
                const baseDateLabel = task.date ? task.date.split('-').reverse().join('/') : '';
                return (
                    <div key={task.id} data-task-id={task.id} style={cardBgStyle} className={`bg-white/90 rounded-lg shadow-sm hover:shadow transition p-1.5 border-l-4 ${getAlertLevel(task)} relative group`}>
                        {conflictReasons.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 text-[11px] text-amber-700 font-semibold mb-1">
                                <Icon name="alert-triangle" size={14} />
                                <span>Conflitos:</span>
                                {conflictReasons.map((reason, idx) => (
                                    <span key={`${task.id}-conflict-${idx}`} className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                                        {reason}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between items-start mb-1 gap-2">
                            <div className="flex-1 space-y-1 leading-tight">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{task.project}</span>
                                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                                        <RatingDisplay
                                            label="P:"
                                            value={task.priority}
                                            color="text-red-400"
                                            onChange={(val) => updateTaskField(task.id, 'priority', val)}
                                        />
                                        <RatingDisplay
                                            label="D:"
                                            value={task.difficulty}
                                            color="text-blue-400"
                                            onChange={(val) => updateTaskField(task.id, 'difficulty', val)}
                                        />
                                    </div>
                                </div>
                                {editingTitleId === task.id ? (
                                    <input
                                        type="text"
                                        value={titleDrafts[task.id] || ''}
                                        className="text-sm font-bold text-slate-800 leading-tight border rounded px-1 py-0.5 w-full"
                                        onChange={e => setTitleDrafts(prev => ({ ...prev, [task.id]: e.target.value }))}
                                        onBlur={() => saveTitleEdit(task)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { e.preventDefault(); saveTitleEdit(task); }
                                            if (e.key === 'Escape') { cancelTitleEdit(task); }
                                        }}
                                        autoFocus
                                    />
                                ) : (
                                    <h3
                                        className="text-sm font-bold text-slate-800 leading-tight cursor-text"
                                        onClick={() => startTitleEdit(task)}
                                        title="Clique para editar o título"
                                    >
                                        {task.title}
                                    </h3>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500">
                                {isExecutionAfterDeadline(task) && (
                                    <span className="text-red-500" title="Execução após o prazo definido">
                                        <Icon name="alert-triangle" size={16} />
                                    </span>
                                )}
                                {task.status === 'Recorrente' && (
                                    <button onClick={() => advanceRecurrence(task)} className="p-1 text-slate-400 hover:text-slate-600 flex items-center gap-1" title="Ir para a próxima ocorrência">
                                        <Icon name="fast-forward" size={14} />
                                        <span className="text-[11px] font-semibold">Próxima</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => quickAddSubtask(task.id)}
                                    className="p-1 text-blue-500 hover:text-blue-700"
                                    title="Adicionar subtarefa rapidamente"
                                >
                                    <Icon name="plus-square" size={14} />
                                </button>
                                <button
                                    onClick={() => toggleNotesVisibility(task.id)}
                                    className={`p-1 ${expandedNotes[task.id] ? 'text-amber-600' : (task.notes ? 'text-amber-500' : 'text-slate-400')} hover:text-amber-600`}
                                    title={expandedNotes[task.id] ? 'Esconder notas' : (task.notes ? 'Ver notas' : 'Adicionar notas')}
                                >
                                    <Icon name="sticky-note" size={14} />
                                </button>
                                <button aria-label={`Editar tarefa ${task.title}`} onClick={() => { setEditingTask(task); setModalOpen(true); }} className="p-1 text-slate-400 hover:text-blue-500"><Icon name="edit-2" size={14}/></button>
                                <button aria-label={`Excluir tarefa ${task.title}`} onClick={() => deleteTask(task.id)} className="p-1 text-slate-400 hover:text-red-500"><Icon name="trash-2" size={14}/></button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-y-1 gap-x-2 text-[12px] text-slate-600 items-center">
                            <div className="flex items-center gap-1" title="Data Execução">
                                <Icon name="calendar" size={14} />
                                {editingDateId === task.id ? (
                                    <input
                                        type="date"
                                        ref={inlineDateInput}
                                        aria-label={`Data de execução de ${task.title}`}
                                        data-inline-date="date"
                                        className="border rounded px-2 py-1 text-[11px]"
                                        value={task.date}
                                        onChange={e => { updateTaskField(task.id, 'date', e.target.value); setEditingDateId(null); }}
                                        onBlur={() => setEditingDateId(null)}
                                        onClick={e => showDatePicker(e.currentTarget)}
                                        autoFocus
                                    />
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className={`${executionDate === todayStr ? 'font-bold text-blue-600' : (executionDate === tomorrowStr ? 'font-bold text-indigo-600' : 'hover:underline')}`}
                                            onClick={() => openInlineDate(task.id, 'date')}
                                            aria-label={`Alterar data de execução de ${task.title}`}
                                            title={postponeDays ? `Data base: ${baseDateLabel}` : undefined}
                                        >
                                            {executionLabel}
                                        </button>
                                    </div>
                                )}
                            </div>
                            {task.deadline && (
                                <div className="flex items-center gap-1 text-red-600" title="Deadline">
                                    <Icon name="alert-circle" size={14} />
                                    {editingDeadlineId === task.id ? (
                                        <input
                                            type="date"
                                            ref={inlineDeadlineInput}
                                            aria-label={`Deadline de ${task.title}`}
                                            data-inline-date="deadline"
                                            className="border rounded px-2 py-1 text-[11px]"
                                            value={task.deadline}
                                            onChange={e => { updateTaskField(task.id, 'deadline', e.target.value); setEditingDeadlineId(null); }}
                                            onBlur={() => setEditingDeadlineId(null)}
                                            onClick={e => showDatePicker(e.currentTarget)}
                                            autoFocus
                                        />
                                    ) : (
                                        <button type="button" className="hover:underline"
                                            onClick={() => openInlineDate(task.id, 'deadline')}
                                            aria-label={`Alterar deadline de ${task.title}`}>
                                            {task.deadline.split('-').reverse().join('/')}
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center gap-1" title="Status">
                                <StatusBadge status={task.status} onClick={() => toggleStatusMenu(task.id)} />
                                {statusMenuTask === task.id && (
                                    <div className="absolute right-0 top-0 mt-6 bg-white shadow-lg rounded border z-10">
                                        {STATUS_OPTIONS.map(s => (
                                            <button key={s} onClick={() => changeStatus(task.id, s)} className="block w-full text-left px-4 py-2 hover:bg-slate-100 text-sm">
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {task.status !== 'Recorrente' && (
                                <PostponeSelector
                                    baseDate={executionDate}
                                    onShift={(shift) => adjustTaskExecutionDate(task.id, shift)}
                                />
                            )}
                            <div className="flex items-center gap-1" title="Prioridade">
                                <Icon name="flag" size={14} />
                                <span className="font-semibold">{task.priority}/5</span>
                            </div>
                            <div className="flex items-center gap-1" title="Dificuldade">
                                <Icon name="trending-up" size={14} />
                                <span className="font-semibold">{task.difficulty}/5</span>
                            </div>
                            {task.recurrence?.frequency !== 'Nenhuma' && (
                                <div className="flex items-center gap-1 text-purple-600" title="Recorrência">
                                    <Icon name="repeat" size={14} />
                                    <span className="font-semibold">{task.recurrence.frequency}</span>
                                </div>
                            )}
                        </div>

                        {expandedNotes[task.id] && (
                            <div className="mt-2">
                                <textarea
                                    className="w-full border rounded px-2 py-1 text-xs"
                                    value={task.notes || ''}
                                    onChange={e => updateTaskField(task.id, 'notes', e.target.value)}
                                    placeholder="Digite observações da tarefa"
                                    rows={3}
                                ></textarea>
                                <p className="text-[11px] text-slate-500 mt-1">Observações editáveis diretamente no cartão.</p>
                            </div>
                        )}

                        {(task.subtasks && task.subtasks.length > 0) && (
                            <div className="mt-2 bg-slate-50 rounded p-2">
                                <button className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-2" onClick={() => toggleSubtasksVisibility(task.id)}>
                                    <Icon name={expandedSubtasks[task.id] ? 'chevron-down' : 'chevron-right'} size={12} />
                                    Subtarefas ({task.subtasks.filter(s => s.completed).length}/{task.subtasks.length})
                                </button>
                                {expandedSubtasks[task.id] && (
                                    <div className="space-y-1">
                                        {task.subtasks.map((sub, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-[12px] text-slate-700">
                                                <input type="checkbox" checked={sub.completed} onChange={() => toggleSubtask(task.id, idx)} />
                                                {editingSubtask?.taskId === task.id && editingSubtask?.index === idx ? (
                                                    <input
                                                        type="text"
                                                        value={subtaskDrafts[`${task.id}-${idx}`] || ''}
                                                        onChange={e => setSubtaskDrafts(prev => ({ ...prev, [`${task.id}-${idx}`]: e.target.value }))}
                                                        onBlur={() => saveEditingSubtask(task.id, idx)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditingSubtask(task.id, idx); if (e.key === 'Escape') setEditingSubtask(null); }}
                                                        className="flex-1 border rounded px-2 py-1"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span className={`${sub.completed ? 'subtask-done' : ''} flex-1`} onClick={() => startEditingSubtask(task.id, idx, sub.text)}>
                                                        {sub.text}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                placeholder="Adicionar subtarefa"
                                                className="flex-1 border rounded px-2 py-1 text-[12px]"
                                                value={inlineSubtaskText[task.id] || ''}
                                                onChange={e => setInlineSubtaskText(prev => ({ ...prev, [task.id]: e.target.value }))}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInlineSubtask(task.id); } }}
                                            />
                                            <button onClick={() => addInlineSubtask(task.id)} className="text-blue-500 hover:text-blue-700 text-sm font-semibold">Incluir</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {task.status === 'Recorrente' && (
                            <div className="mt-2 text-[11px] text-purple-600 bg-purple-50 border border-purple-200 rounded p-2 flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                    <Icon name="clock-3" size={12} /> Próxima ocorrência: {getNextRecurrenceDate(task) || 'Configure a recorrência'}
                                </div>
                                <button onClick={() => advanceRecurrence(task)} className="text-purple-700 hover:text-purple-900 text-xs font-semibold flex items-center gap-1">
                                    <Icon name="skip-forward" size={12} /> Avançar
                                </button>
                            </div>
                        )}

                        {task.status === 'Recorrente' && (
                            <div className="absolute inset-0 rounded-lg border border-purple-200 pointer-events-none"></div>
                        )}
                    </div>
                );
            };

            return (
                <div className="min-h-screen flex flex-col md:flex-row">
                    {storageError && <div role="alert" className="fixed top-0 left-0 right-0 z-[60] bg-red-100 text-red-800 p-3">{storageError}</div>}
                    {/* SIDEBAR */}
                    <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col shadow-xl z-10">
                        <h1 className="text-2xl font-bold flex items-center gap-2 mb-8">
                            <Icon name="check-square" className="text-blue-400" /> TaskMaster
                        </h1>

                        <nav className="flex-1 space-y-2">
                            <button onClick={() => setView('dashboard')} className={`w-full text-left px-4 py-2 rounded flex items-center gap-2 ${view === 'dashboard' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
                                <Icon name="layout-dashboard" size={18}/> Dashboard
                            </button>
                            <button onClick={() => setView('conflicts')} className={`w-full text-left px-4 py-2 rounded flex items-center gap-2 ${view === 'conflicts' ? 'bg-amber-500 text-slate-900' : 'hover:bg-slate-800'}`}>
                                <Icon name="alert-octagon" size={18}/> Conflitos
                                {conflictTasks.length > 0 && (
                                    <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">{conflictTasks.length}</span>
                                )}
                            </button>
                            <button onClick={() => setView('planner')} className={`w-full text-left px-4 py-2 rounded flex items-center gap-2 ${view === 'planner' ? 'bg-emerald-500 text-slate-900' : 'hover:bg-slate-800'}`}>
                                <Icon name="calendar-range" size={18}/> Planejamento
                            </button>
                            <button onClick={() => setView('settings')} className={`w-full text-left px-4 py-2 rounded flex items-center gap-2 ${view === 'settings' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
                                <Icon name="settings" size={18}/> Configurações
                            </button>
                        </nav>

                        <div className="mt-8 pt-8 border-t border-slate-700 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Hoje</span>
                                <span className="bg-blue-500 px-2 rounded-full text-xs font-bold">{stats.today}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Amanhã</span>
                                <span className="bg-indigo-500 px-2 rounded-full text-xs font-bold">{stats.tomorrow}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Atrasadas</span>
                                <span className="bg-red-500 px-2 rounded-full text-xs font-bold">{stats.late}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Alerta Laranja</span>
                                <span className="bg-orange-300 text-slate-900 px-2 rounded-full text-xs font-bold">{stats.alertOrange}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Alerta Vermelho</span>
                                <span className="bg-red-400 text-white px-2 rounded-full text-xs font-bold">{stats.alertRed}</span>
                            </div>
                        </div>

                        <button onClick={() => { setEditingTask(null); setModalOpen(true); }} className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded font-bold shadow-lg flex justify-center items-center gap-2 transition">
                            <Icon name="plus" /> Nova Tarefa
                        </button>
                    </aside>

                    {/* MAIN CONTENT */}
                    <main className="flex-1 overflow-y-auto h-screen bg-slate-100 p-4 md:p-6">

                        {view === 'dashboard' && (
                            <div className="max-w-5xl mx-auto">
                                {/* Filters Bar */}
                                <div className="bg-white p-3 rounded-lg shadow-sm mb-4 flex flex-col md:flex-row gap-3 items-end md:items-center justify-between">
                                    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto items-start md:items-center">
                                        <select className="border rounded px-2 py-1.5 text-sm" value={filters.project} onChange={e => setFilters({...filters, project: e.target.value})}>
                                            <option value="Todos">Todos Projetos</option>
                                            {projects.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                        <select className="border rounded px-2 py-1.5 text-sm" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                                            <option value="Todos">Todos Status</option>
                                            <option value="Aberta">Aberta</option>
                                            <option>Em Andamento</option>
                                            <option>Concluída</option>
                                            <option>Recorrente</option>
                                            <option>Cancelada</option>
                                        </select>
                                        <div className="flex gap-2 items-center">
                                            <select className="border rounded px-2 py-1.5 text-sm" value={filters.dateFilter} onChange={e => setFilters({...filters, dateFilter: e.target.value})}>
                                                <option value="Todos">Todas Datas</option>
                                                <option value="Hoje">Hoje</option>
                                                <option value="Amanhã">Amanhã</option>
                                                <option value="Período">Período</option>
                                            </select>
                                            {filters.dateFilter === 'Período' && (
                                                <div className="flex gap-2 items-center text-xs text-slate-500">
                                                    <input type="date" className="border rounded px-2 py-1" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                                                    <span>a</span>
                                                    <input type="date" className="border rounded px-2 py-1" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 text-xs text-slate-500 max-w-xs">
                                        <span className="font-semibold text-slate-600">Ordenação</span>
                                        <p>As tarefas são sempre ordenadas pela data de execução. Defina a hierarquia de desempate em <strong>Configurações</strong>.</p>
                                    </div>
                                    <div className="w-full md:w-64">
                                        <input type="text" placeholder="Buscar tarefa..." className="border rounded px-2 py-1.5 w-full text-sm" value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
                                    </div>
                                </div>

                                {/* Tasks Grid */}
                                <div className="grid gap-3">
                                    {filteredTasks.length === 0 && (
                                        <div className="text-center text-slate-400 py-10">Nenhuma tarefa encontrada.</div>
                                    )}

                                    {filteredTasks.map(task => renderTaskCard(task))}
                                </div>
                            </div>
                        )}

                        {view === 'planner' && (
                            <div className="max-w-6xl mx-auto">
                                <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3 mb-4">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-700">
                                        <Icon name="calendar-range" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold text-slate-800">Planejar por Semana</h2>
                                        <p className="text-sm text-slate-600">Selecione a semana e o dia útil para reagendar rapidamente.</p>
                                    </div>
                                    <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">{planningTasks.length} tarefas</span>
                                </div>

                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                                    <p className="text-sm text-slate-600">Organize as tarefas por semana antes de aplicar na agenda.</p>
                                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300"
                                            checked={groupPlannerByProject}
                                            onChange={(e) => setGroupPlannerByProject(e.target.checked)}
                                        />
                                        Agrupar por projeto
                                    </label>
                                </div>

                                <div className="bg-white rounded-lg shadow overflow-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-600 text-left">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold w-36">Projeto</th>
                                                <th className="px-4 py-3 font-semibold">Ação</th>
                                                {weekOptions.map(option => (
                                                    <th key={option.offset} className="px-3 py-3 font-semibold text-center">{option.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {planningTasks.length === 0 && (
                                                <tr>
                                                    <td colSpan={weekOptions.length + 2} className="px-4 py-6 text-center text-slate-400">Nenhuma tarefa pendente para replanejar.</td>
                                                </tr>
                                            )}
                                            {!groupPlannerByProject && planningTasks.map(renderPlannerRow)}
                                            {groupPlannerByProject && planningTasksByProject.map(({ projectName, projectTasks }) => (
                                                <React.Fragment key={projectName}>
                                                    <tr className="bg-emerald-50">
                                                        <td colSpan={weekOptions.length + 2} className="px-4 py-2 font-semibold text-emerald-800">
                                                            {projectName}
                                                            <span className="text-xs text-emerald-700 ml-2">{projectTasks.length} tarefa(s)</span>
                                                        </td>
                                                    </tr>
                                                    {projectTasks.map(renderPlannerRow)}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4">
                                    <p className="text-sm text-slate-600">
                                        Selecione a semana desejada e o dia (S, T, Q, Q, S) para cada tarefa. Apenas dias úteis são considerados.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={applyWeeklyPlan}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 shadow"
                                    >
                                        <Icon name="calendar-check" size={18} /> Programar
                                    </button>
                                </div>
                            </div>
                        )}

                        {view === 'conflicts' && (
                            <div className="max-w-5xl mx-auto">
                                <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3 mb-4">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-amber-700">
                                        <Icon name="alert-octagon" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold text-slate-800">Tarefas com Conflitos</h2>
                                        <p className="text-sm text-slate-600">Recorrências vencidas, alertas críticos de deadline, tarefas atrasadas ou com execução após o prazo.</p>
                                    </div>
                                    <span className="text-sm font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">{conflictTasks.length} itens</span>
                                </div>

                                <div className="grid gap-3">
                                    {conflictTasks.length === 0 && (
                                        <div className="text-center text-slate-400 py-10">Nenhum conflito encontrado no momento.</div>
                                    )}

                                    {conflictTasks.map(({ task, reasons }) => renderTaskCard(task, reasons))}
                                </div>
                            </div>
                        )}

                        {view === 'settings' && (
                            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
                                <h2 className="text-xl font-bold mb-6 border-b pb-2">Configurações</h2>

                                <div className="mb-8">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Icon name="bell" className="text-yellow-500" /> Configuração de Alertas (Deadline)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm text-slate-600 mb-1">Alerta Amarelo (Dias antes)</label>
                                            <input type="number" value={config.alertYellow} onChange={e => setConfig({...config, alertYellow: parseInt(e.target.value)})} className="border rounded p-2 w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-600 mb-1">Alerta Laranja (Dias antes)</label>
                                            <input type="number" value={config.alertOrange} onChange={e => setConfig({...config, alertOrange: parseInt(e.target.value)})} className="border rounded p-2 w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-600 mb-1">Alerta Vermelho (Dias antes)</label>
                                            <input type="number" value={config.alertRed} onChange={e => setConfig({...config, alertRed: parseInt(e.target.value)})} className="border rounded p-2 w-full" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                        <div>
                                            <label className="block text-sm text-slate-600 mb-1">Cor fundo Hoje</label>
                                            <input type="color" value={config.todayBg} onChange={e => setConfig({...config, todayBg: e.target.value})} className="border rounded p-2 w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-600 mb-1">Cor fundo Amanhã</label>
                                            <input type="color" value={config.tomorrowBg} onChange={e => setConfig({...config, tomorrowBg: e.target.value})} className="border rounded p-2 w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-600 mb-1">Cor fundo Deadline Atingido</label>
                                            <input type="color" value={config.deadlineBg} onChange={e => setConfig({...config, deadlineBg: e.target.value})} className="border rounded p-2 w-full" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">Se o deadline passar, a tarefa utilizará a cor escolhida e a borda preta configurada.</p>
                                </div>

                                <div className="mb-8 border-t pt-6">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Icon name="layers" className="text-indigo-500" /> Prioridade dos Projetos</h3>
                                    <p className="text-sm text-slate-600 mb-3">Defina a hierarquia de prioridade para ordenar tarefas por projeto. Números maiores significam maior prioridade.</p>
                                    {activeProjects.length === 0 ? (
                                        <p className="text-sm text-slate-500">Nenhum projeto com tarefas ativas no momento.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {activeProjects.map(projectName => (
                                                <div key={projectName} className="flex flex-col md:flex-row md:items-center gap-2 border rounded p-2">
                                                    <span className="font-semibold text-slate-700 md:w-48">{projectName}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="10"
                                                        step="1"
                                                        className="border rounded px-2 py-1 w-full md:w-24"
                                                        value={config.projectPriorities?.[projectName] ?? ''}
                                                        onChange={e => {
                                                            const raw = e.target.value;
                                                            const numeric = raw === '' ? '' : parseInt(raw, 10);
                                                            updateProjectPriority(projectName, numeric);
                                                        }}
                                                    />
                                                    <span className="text-xs text-slate-500 flex-1">Campo em branco = menor prioridade.</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="mb-8 border-t pt-6">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Icon name="list-ordered" className="text-emerald-500" /> Desempate de Ordenação</h3>
                                    <p className="text-sm text-slate-600 mb-3">A data de execução é sempre o critério principal. Ajuste abaixo a ordem de classificação usada para desempatar tarefas na mesma data.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {secondarySortLevels.map(({ field, direction }, idx) => (
                                            <div key={idx} className="flex flex-col gap-1">
                                                <label className="text-sm text-slate-600">Nível {idx + 1}</label>
                                                <select
                                                    className="border rounded px-3 py-2 text-sm"
                                                    value={field}
                                                    onChange={(e) => updateSecondarySortLevel(idx, e.target.value)}
                                                >
                                                    {SECONDARY_FIELDS.map(option => (
                                                        <option key={option} value={option}>{SECONDARY_FIELD_LABELS[option]}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    className="border rounded px-3 py-2 text-sm"
                                                    value={direction}
                                                    onChange={(e) => updateSecondarySortDirection(idx, e.target.value)}
                                                >
                                                    <option value="asc">Crescente (A→Z / menor → maior)</option>
                                                    <option value="desc">Decrescente (Z→A / maior → menor)</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">Salvamos automaticamente essa ordem para uso futuro.</p>
                                </div>

                                <div className="mb-8 border-t pt-6">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Icon name="calendar-clock" className="text-blue-500" /> Reprogramação em Massa (Shift)</h3>
                                    <p className="text-sm text-slate-600 mb-3">Empurrar data de execução de todas as tarefas pendentes.</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={() => shiftAllTasks(1)} className="bg-blue-100 text-blue-700 px-4 py-2 rounded hover:bg-blue-200">+1 Dia</button>
                                        <button onClick={() => shiftAllTasks(3)} className="bg-blue-100 text-blue-700 px-4 py-2 rounded hover:bg-blue-200">+3 Dias</button>
                                        <button onClick={() => shiftAllTasks(7, false)} className="bg-blue-100 text-blue-700 px-4 py-2 rounded hover:bg-blue-200">+1 Semana</button>
                                        <button onClick={() => shiftTasksFromEarliest(businessToday, 'a partir de hoje')} className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded hover:bg-indigo-200">A partir de hoje</button>
                                        <button onClick={() => shiftTasksFromEarliest(businessTomorrow, 'a partir de amanhã')} className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded hover:bg-indigo-200">A partir de amanhã</button>
                                    </div>
                                    <div className="flex flex-col md:flex-row md:items-end gap-3 mt-4">
                                        <div className="flex flex-col gap-1 w-full md:w-auto">
                                            <label className="text-sm text-slate-600">Offset em dias úteis</label>
                                            <input
                                                type="text"
                                                value={reprogramOffset}
                                                onChange={e => setReprogramOffset(e.target.value)}
                                                placeholder="Ex.: +1 ou -2"
                                                className="border rounded px-3 py-2 w-full md:min-w-[160px]"
                                            />
                                            <p className="text-xs text-slate-500">Use valores positivos ou negativos para adiar ou antecipar.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const value = parseInt(reprogramOffset, 10);
                                                if (Number.isNaN(value) || value === 0) {
                                                    alert('Informe um offset diferente de zero.');
                                                    return;
                                                }
                                                shiftAllTasks(value, true);
                                            }}
                                            className="bg-amber-100 text-amber-800 px-4 py-2 rounded hover:bg-amber-200 font-semibold"
                                        >
                                            Aplicar offset
                                        </button>
                                    </div>
                                </div>

                                <div className="border-t pt-6">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Icon name="database" className="text-green-500" /> Backup de Dados</h3>
                                    <div className="flex gap-4">
                                        <button onClick={exportData} className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 flex items-center gap-2">
                                            <Icon name="download" size={16} /> Exportar Backup
                                        </button>
                                        <label className="bg-slate-200 text-slate-800 px-4 py-2 rounded hover:bg-slate-300 cursor-pointer flex items-center gap-2">
                                            <Icon name="upload" size={16} /> Restaurar Backup
                                            <input type="file" className="hidden" onChange={importData} accept=".json" />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                    </main>

                    {/* TASK MODAL (Form) */}
                    {modalOpen && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
                            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto modal-animate">
                                <TaskForm
                                    task={editingTask}
                                    projects={projects}
                                    tasks={tasks}
                                    onSave={saveTask}
                                    onCancel={() => setModalOpen(false)}
                                    onDeleteProject={deleteProject}
                                />
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // 4. TASK FORM COMPONENT
        function TaskForm({ task, projects, tasks = [], onSave, onCancel, onDeleteProject }) {
            const initialTask = task ? { ...task, recurrence: { ...defaultRecurrence, ...(task.recurrence || {}) } } : {
                title: '',
                project: projects[0] || DEFAULT_PROJECT,
                date: getTodayStr(),
                deadline: addBusinessDays(getTodayStr(), 10),
                status: 'Em Andamento',
                priority: 3,
                difficulty: 3,
                deferBusinessDays: 0,
                notes: '',
                subtasks: [],
                recurrence: { ...defaultRecurrence }
            };

            const [formData, setFormData] = useState(initialTask);

            const [newProject, setNewProject] = useState('');
            const [showNewProjInput, setShowNewProjInput] = useState(false);
            const [tempSubtask, setTempSubtask] = useState('');
            const [monthDaysInput, setMonthDaysInput] = useState((initialTask.recurrence?.daysOfMonth || []).join(','));

            useEffect(() => {
                setFormData(task ? { ...task, recurrence: { ...defaultRecurrence, ...(task.recurrence || {}) } } : initialTask);
                setMonthDaysInput(((task && task.recurrence?.daysOfMonth) || initialTask.recurrence?.daysOfMonth || []).join(','));
            }, [task]);

            useEffect(() => {
                if (formData.project && !projects.includes(formData.project)) {
                    setFormData(prev => ({ ...prev, project: projects[0] || DEFAULT_PROJECT }));
                }
            }, [projects]);

            const updateRecurrence = (changes) => {
                setFormData(prev => ({
                    ...prev,
                    recurrence: { ...defaultRecurrence, ...(prev.recurrence || {}), ...changes }
                }));
            };

            const submitForm = () => {
                let recurrenceData = { ...defaultRecurrence, ...(formData.recurrence || {}) };

                if (formData.status === 'Recorrente') {
                    if (recurrenceData.frequency === 'Mensal') {
                        const parsed = monthDaysInput
                            .split(',')
                            .map(v => parseInt(v.trim()))
                            .filter(v => !isNaN(v) && v >= 1 && v <= 31);
                        recurrenceData = { ...recurrenceData, daysOfMonth: parsed };
                    }

                    if (recurrenceData.frequency === 'Semanal' && (!recurrenceData.daysOfWeek || recurrenceData.daysOfWeek.length === 0)) {
                        alert('Escolha pelo menos um dia da semana para a recorrência.');
                        return;
                    }

                    if (recurrenceData.frequency === 'Mensal' && (!recurrenceData.daysOfMonth || recurrenceData.daysOfMonth.length === 0)) {
                        alert('Informe pelo menos um dia do mês para a recorrência.');
                        return;
                    }
                } else {
                    recurrenceData = { ...defaultRecurrence };
                }

                onSave({
                    ...formData,
                    project: showNewProjInput && newProject ? newProject : formData.project,
                    recurrence: recurrenceData
                });
            };

            const handleSubmit = (e) => {
                e.preventDefault();
                submitForm();
            };

            const addSubtask = () => {
                if (!tempSubtask.trim()) return;
                setFormData({...formData, subtasks: [...(formData.subtasks || []), { text: tempSubtask, completed: false }]});
                setTempSubtask('');
            };

            const removeSubtask = (index) => {
                const newSubs = [...formData.subtasks];
                newSubs.splice(index, 1);
                setFormData({...formData, subtasks: newSubs});
            };

            return (
                <form onSubmit={handleSubmit} onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.dataset.preventSubmit) {
                        e.preventDefault();
                        submitForm();
                    }
                }} className="p-5">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h2 className="text-xl font-bold text-slate-800">{task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><Icon name="x" /></button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Título da Tarefa</label>
                            <input required type="text" className="w-full border p-2 rounded" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Projeto</label>
                            {!showNewProjInput ? (
                                <div className="flex gap-2">
                                    <select className="w-full border p-2 rounded" value={formData.project} onChange={e => setFormData({...formData, project: e.target.value})}>
                                        {projects.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    <button type="button" onClick={() => setShowNewProjInput(true)} className="bg-slate-200 p-2 rounded hover:bg-slate-300" title="Novo Projeto"><Icon name="plus" size={16}/></button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Nome do projeto" className="w-full border p-2 rounded" value={newProject} onChange={e => setNewProject(e.target.value)} />
                                    <button type="button" onClick={() => setShowNewProjInput(false)} className="text-red-500 p-2"><Icon name="x" size={16}/></button>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2 mt-2">
                                {projects.map(projectName => {
                                    const hasBlockedTasks = tasks.some(t => t.project === projectName && (t.status === 'Em Andamento' || t.status === 'Recorrente'));
                                    const isDefaultProject = projectName === DEFAULT_PROJECT;
                                    return (
                                        <span key={projectName} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-100 border border-slate-200">
                                            <span className="font-semibold text-slate-700">{projectName}</span>
                                            {!isDefaultProject && (
                                                <button
                                                    type="button"
                                                    disabled={hasBlockedTasks}
                                                    onClick={() => onDeleteProject && onDeleteProject(projectName)}
                                                    className={`p-1 rounded ${hasBlockedTasks ? 'text-slate-400 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                                                    title={hasBlockedTasks ? 'Existem tarefas em andamento ou recorrentes' : 'Excluir projeto'}
                                                >
                                                    <Icon name="x" size={14} />
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                            <select className="w-full border p-2 rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                                <option>Em Andamento</option>
                                <option>Concluída</option>
                                <option>Recorrente</option>
                                <option>Cancelada</option>
                            </select>
                        </div>

                        {formData.status === 'Recorrente' && (
                            <div className="col-span-2 bg-slate-50 border border-slate-200 p-3 rounded space-y-3">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Frequência da Recorrência</label>
                                    <select
                                        className="w-full border p-2 rounded"
                                        value={formData.recurrence?.frequency || 'Nenhuma'}
                                        onChange={e => updateRecurrence({ frequency: e.target.value })}
                                    >
                                        <option value="Nenhuma">Selecione</option>
                                        <option value="Diária">Diária</option>
                                        <option value="Semanal">Semanal</option>
                                        <option value="Mensal">Mensal</option>
                                    </select>
                                </div>

                                {formData.recurrence?.frequency === 'Semanal' && (
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Dias da Semana</label>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                            {WEEKDAY_LABELS.map((day, idx) => {
                                                const selected = (formData.recurrence?.daysOfWeek || []).includes(idx);
                                                return (
                                                    <label key={day} className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${selected ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() => {
                                                                const current = formData.recurrence?.daysOfWeek || [];
                                                                const next = current.includes(idx) ? current.filter(d => d !== idx) : [...current, idx];
                                                                updateRecurrence({ daysOfWeek: next });
                                                            }}
                                                        />
                                                        {day}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {formData.recurrence?.frequency === 'Mensal' && (
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Dias do Mês (separe com vírgula)</label>
                                        <input
                                            type="text"
                                            className="w-full border p-2 rounded"
                                            placeholder="Ex: 1, 15, 30"
                                            value={monthDaysInput}
                                            onChange={e => {
                                                setMonthDaysInput(e.target.value);
                                                const parsed = e.target.value
                                                    .split(',')
                                                    .map(v => parseInt(v.trim()))
                                                    .filter(v => !isNaN(v) && v >= 1 && v <= 31);
                                                updateRecurrence({ daysOfMonth: parsed });
                                            }}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">A tarefa irá para o próximo dia informado ao clicar em "Próxima".</p>
                                    </div>
                                )}
                            </div>
                        )}



                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Data Execução</label>
                            <input type="date" required className="w-full border p-2 rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-red-600 mb-1">Deadline (Prazo Final)</label>
                            <input type="date" className="w-full border border-red-200 p-2 rounded bg-red-50" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Prioridade (1-5)</label>
                            <input type="range" min="1" max="5" className="w-full" value={formData.priority} onChange={e => setFormData({...formData, priority: parseInt(e.target.value)})} />
                            <div className="flex justify-between text-xs text-slate-400"><span>Baixa</span><span>Alta</span></div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Dificuldade (1-5)</label>
                            <input type="range" min="1" max="5" className="w-full" value={formData.difficulty} onChange={e => setFormData({...formData, difficulty: parseInt(e.target.value)})} />
                             <div className="flex justify-between text-xs text-slate-400"><span>Fácil</span><span>Difícil</span></div>
                        </div>

                        <div className="col-span-2">
                             <label className="block text-sm font-bold text-slate-700 mb-1">Subtarefas</label>
                             <div className="flex gap-2 mb-2">
                                <input type="text" placeholder="Adicionar item..." className="flex-1 border p-2 rounded text-sm" value={tempSubtask} onChange={e => setTempSubtask(e.target.value)} data-prevent-submit="true" onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())} />
                                <button type="button" onClick={addSubtask} className="bg-blue-100 text-blue-600 px-3 rounded font-bold">+</button>
                             </div>
                             <ul className="space-y-1">
                                {(formData.subtasks || []).map((sub, idx) => (
                                    <li key={idx} className="flex justify-between bg-slate-50 p-2 rounded text-sm">
                                        <span>{sub.text}</span>
                                        <button type="button" onClick={() => removeSubtask(idx)} className="text-red-400 hover:text-red-600"><Icon name="x" size={14}/></button>
                                    </li>
                                ))}
                             </ul>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Observações</label>
                            <textarea className="w-full border p-2 rounded h-20" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4 pt-3 border-t">
                        <button type="button" onClick={onCancel} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow-lg">Salvar Tarefa</button>
                    </div>
                </form>
            );
        }

        const root = createRoot(document.getElementById('root'));
        root.render(<App />);
