import {
  Component,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import {
  CalendarOptions,
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import {
  LucideCalendar,
  LucideRefreshCw,
  LucideLoaderCircle,
  LucideX,
  LucidePlus,
  LucideUsers,
} from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import {
  CalendarApiService,
  CalendarEventDto,
  CalendarResource,
  NonWorkingDay,
} from '../../core/services/calendar-api.service';
import { TaskAssignerModalComponent } from '../tasks/task-assigner-modal';
import { formatInTimeZone } from 'date-fns-tz';

type ViewMode = 'calendar' | 'resources' | 'agenda';

const TZ = 'America/Bogota';

@Component({
  selector: 'app-calendar-page',
  imports: [
    FormsModule,
    RouterLink,
    FullCalendarModule,
    TaskAssignerModalComponent,
    LucideCalendar,
    LucideRefreshCw,
    LucideLoaderCircle,
    LucideX,
    LucidePlus,
    LucideUsers,
  ],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.css',
})
export class CalendarPage implements OnInit {
  private readonly api = inject(CalendarApiService);
  readonly auth = inject(AuthService);

  @ViewChild('fc') fc?: FullCalendarComponent;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly events = signal<CalendarEventDto[]>([]);
  readonly nonWorking = signal<NonWorkingDay[]>([]);
  readonly resources = signal<CalendarResource[]>([]);
  readonly selectedAdvisors = signal<string[]>([]);
  readonly viewMode = signal<ViewMode>('calendar');
  readonly rangeFrom = signal('');
  readonly rangeTo = signal('');

  readonly showAssigner = signal(false);
  readonly assignDueDate = signal('');

  readonly sheetOpen = signal(false);
  readonly selected = signal<CalendarEventDto | null>(null);
  readonly sheetAssignee = signal('');
  readonly sheetDue = signal('');
  readonly sheetSaving = signal(false);
  readonly sheetError = signal<string | null>(null);

  readonly isManager = computed(() => this.auth.isSuperAdmin());
  readonly draggingId = signal<string | null>(null);

  private rangeLoaded = '';

  readonly calendarOptions = signal<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: this.detectInitialView(),
    locale: esLocale,
    timeZone: TZ,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    height: 'auto',
    editable: true,
    selectable: true,
    eventDisplay: 'block',
    dayMaxEvents: 4,
    weekends: true,
    nowIndicator: true,
    events: [],
    select: (arg) => this.onDateSelect(arg),
    dateClick: (arg) => this.openCreate(arg.dateStr),
    eventClick: (arg) => this.onEventClick(arg),
    eventDrop: (arg) => this.onEventDrop(arg),
    datesSet: (arg) => {
      const from = arg.startStr.slice(0, 10);
      const to = arg.endStr.slice(0, 10);
      const key = `${from}|${to}|${this.selectedAdvisors().join(',')}`;
      this.rangeFrom.set(from);
      this.rangeTo.set(to);
      if (key !== this.rangeLoaded) {
        this.rangeLoaded = key;
        this.loadEvents();
      }
    },
    eventContent: (arg) => {
      const ext = arg.event.extendedProps as Partial<CalendarEventDto>;
      const initials = this.isManager() ? ext.assigneeInitials : '';
      return {
        html: `<div class="fc-ev"><span class="fc-ev__dot"></span>${
          initials
            ? `<em class="fc-ev__av">${initials}</em>`
            : ''
        }<strong>${arg.event.title}</strong></div>`,
      };
    },
    dayCellClassNames: (arg) => {
      const key = formatInTimeZone(arg.date, TZ, 'yyyy-MM-dd');
      return this.nonWorking().some((d) => d.date === key)
        ? ['is-non-working']
        : [];
    },
  });

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      this.viewMode.set('agenda');
    }
    if (this.isManager()) {
      this.api.resources().subscribe({
        next: (r) => this.resources.set(r),
        error: () => this.resources.set([]),
      });
    }
  }

  private detectInitialView(): string {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'listWeek';
    }
    return 'dayGridMonth';
  }

  loadEvents(): void {
    const from = this.rangeFrom();
    const to = this.rangeTo();
    if (!from || !to) return;
    this.loading.set(true);
    this.error.set(null);
    const advisors =
      this.isManager() && this.selectedAdvisors().length
        ? this.selectedAdvisors()
        : undefined;
    this.api.events(from, to, advisors).subscribe({
      next: (res) => {
        this.events.set(res.events);
        this.nonWorking.set(res.nonWorkingDays);
        this.syncFcEvents(res.events);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'No se pudo cargar el calendario');
      },
    });
  }

  private syncFcEvents(list: CalendarEventDto[]): void {
    const mapped: EventInput[] = list.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.dateKey,
      allDay: true,
      backgroundColor: e.backgroundColor,
      borderColor: e.borderColor,
      textColor: e.textColor,
      editable: this.isManager() || e.assigneeId === this.auth.user()?.id,
      extendedProps: { ...e },
    }));
    const api = this.fc?.getApi();
    if (api) {
      api.removeAllEvents();
      api.addEventSource(mapped);
    } else {
      this.calendarOptions.update((opt) => ({ ...opt, events: mapped }));
    }
  }

  toggleAdvisor(id: string): void {
    this.selectedAdvisors.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  applyAdvisorFilter(): void {
    this.rangeLoaded = '';
    this.loadEvents();
  }

  clearAdvisorFilter(): void {
    this.selectedAdvisors.set([]);
    this.rangeLoaded = '';
    this.loadEvents();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'calendar' && this.fc) {
      queueMicrotask(() => this.fc?.getApi().updateSize());
    }
  }

  openCreate(dateStr: string): void {
    this.assignDueDate.set(dateStr.slice(0, 10));
    this.showAssigner.set(true);
  }

  onDateSelect(arg: DateSelectArg): void {
    this.openCreate(arg.startStr);
    arg.view.calendar.unselect();
  }

  onEventClick(arg: EventClickArg): void {
    const ev = arg.event.extendedProps as CalendarEventDto;
    this.selected.set({
      ...ev,
      id: arg.event.id,
      title: arg.event.title,
    });
    this.sheetAssignee.set(ev.assigneeId ?? '');
    this.sheetDue.set(ev.dateKey);
    this.sheetError.set(null);
    this.sheetOpen.set(true);
  }

  onEventDrop(arg: EventDropArg): void {
    const id = arg.event.id;
    const dateStr = arg.event.startStr.slice(0, 10);
    // Optimistic: already moved by FC
    this.api.move(id, { dueDate: `${dateStr}T17:00:00.000Z` }).subscribe({
      next: () => this.loadEvents(),
      error: () => {
        arg.revert();
        this.error.set('No se pudo reprogramar la tarea');
      },
    });
  }

  closeSheet(): void {
    this.sheetOpen.set(false);
    this.selected.set(null);
  }

  saveSheet(): void {
    const ev = this.selected();
    if (!ev) return;
    this.sheetSaving.set(true);
    this.sheetError.set(null);
    const body: { assigneeId?: string; dueDate?: string } = {
      dueDate: `${this.sheetDue()}T17:00:00.000Z`,
    };
    if (this.isManager() && this.sheetAssignee()) {
      body.assigneeId = this.sheetAssignee();
    }
    // Optimistic local update
    this.events.update((list) =>
      list.map((e) =>
        e.id === ev.id
          ? {
              ...e,
              dateKey: this.sheetDue(),
              assigneeId: body.assigneeId ?? e.assigneeId,
            }
          : e,
      ),
    );
    this.api.move(ev.id, body).subscribe({
      next: () => {
        this.sheetSaving.set(false);
        this.closeSheet();
        this.loadEvents();
      },
      error: (err: { error?: { message?: string } }) => {
        this.sheetSaving.set(false);
        this.sheetError.set(err?.error?.message ?? 'No se pudo guardar');
        this.loadEvents();
      },
    });
  }

  eventsForResource(resourceId: string): CalendarEventDto[] {
    return this.events().filter((e) => e.assigneeId === resourceId);
  }

  onDragStart(id: string, ev: DragEvent): void {
    if (!this.isManager()) return;
    this.draggingId.set(id);
    ev.dataTransfer?.setData('text/plain', id);
    ev.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(ev: DragEvent): void {
    if (!this.isManager()) return;
    ev.preventDefault();
  }

  onDropResource(resourceId: string, ev: DragEvent): void {
    ev.preventDefault();
    if (!this.isManager()) return;
    const id = ev.dataTransfer?.getData('text/plain') || this.draggingId();
    this.draggingId.set(null);
    if (!id) return;
    const task = this.events().find((e) => e.id === id);
    if (!task || task.assigneeId === resourceId) return;

    // Optimistic
    this.events.update((list) =>
      list.map((e) =>
        e.id === id
          ? {
              ...e,
              assigneeId: resourceId,
              resourceId,
              assigneeName:
                this.resources().find((r) => r.id === resourceId)?.title ??
                e.assigneeName,
            }
          : e,
      ),
    );

    this.api.move(id, { assigneeId: resourceId }).subscribe({
      next: () => this.loadEvents(),
      error: () => {
        this.error.set('No se pudo reasignar por drag & drop');
        this.loadEvents();
      },
    });
  }

  onTaskCreated(): void {
    this.loadEvents();
  }
}
