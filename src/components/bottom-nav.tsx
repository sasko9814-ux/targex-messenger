import { Link } from "@tanstack/react-router";
import { MessageCircle, Settings, UserRound } from "lucide-react";

export function BottomNav() {
  const item =
    "flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground transition data-[status=active]:text-primary";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        <Link to="/chats" className={item}>
          <MessageCircle className="h-5 w-5" /> Чати
        </Link>
        <Link to="/profile" className={item}>
          <UserRound className="h-5 w-5" /> Профіль
        </Link>
        <Link to="/settings" className={item}>
          <Settings className="h-5 w-5" /> Налаштування
        </Link>
      </div>
    </nav>
  );
}

export function Avatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "md" | "sm" }) {
  const cls = size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    <img src={url} alt="" referrerPolicy="no-referrer" className={`${cls} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${cls} grid shrink-0 place-items-center rounded-full bg-secondary font-bold text-primary`}>
      {initials}
    </div>
  );
}
