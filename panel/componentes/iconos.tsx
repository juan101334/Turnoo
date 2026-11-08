import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Ellipsis,
  Gauge,
  Hourglass,
  MessageSquare,
  Scissors,
  Store,
  User,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ClaveSeccion } from '@/lib/navegacion';

/** Un ícono por sección, siempre acompañado de su texto. */
export const ICONOS: Record<ClaveSeccion, LucideIcon> = {
  hoy: CalendarCheck,
  agenda: CalendarDays,
  porAprobar: Hourglass,
  mensajes: MessageSquare,
  bloqueos: CalendarOff,
  clientes: Users,
  equipo: Scissors,
  usuarios: UserCog,
  conocimiento: BookOpen,
  plan: Gauge,
  negocio: Store,
  cuenta: User,
  mas: Ellipsis,
};
