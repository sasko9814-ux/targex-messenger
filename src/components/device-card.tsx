import { useEffect, useState } from "react";
import { Bell, BellOff, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";

type InstallEvent = Event & { prompt: () => Promise<void> };

const stateText: Record<PushState, string> = {
  unsupported: "Цей браузер не підтримує push-сповіщення.",
  iframe: "Відкрийте застосунок у новій вкладці, щоб увімкнути сповіщення.",
  unconfigured: "Push-сповіщення ще не налаштовані власником застосунку. Нові повідомлення показуються, коли застосунок відкритий.",
  denied: "Сповіщення заблоковано в налаштуваннях браузера.",
  off: "Отримуйте сповіщення про нові повідомлення.",
  on: "Сповіщення увімкнено на цьому пристрої.",
};

export function DeviceCard() {
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    getPushState().then(setPush).catch(() => setPush("unsupported"));
    const h = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      setPush(push === "on" ? await disablePush() : await enablePush());
    } catch {
      toast.error("Не вдалося змінити сповіщення");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-3">
      <div className="rounded-2xl bg-card p-4">
        <p className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-primary" /> Сповіщення</p>
        <p className="mt-1 text-sm text-muted-foreground">{push ? stateText[push] : "Перевірка…"}</p>
        {(push === "off" || push === "on") && (
          <button onClick={toggle} disabled={busy} className="mt-3 flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : push === "on" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {push === "on" ? "Вимкнути" : "Увімкнути сповіщення"}
          </button>
        )}
      </div>
      <div className="rounded-2xl bg-card p-4">
        <p className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-primary" /> Встановити на Android</p>
        {install ? (
          <button onClick={() => install.prompt().then(() => setInstall(null))} className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Встановити TargeX
          </button>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            У Chrome відкрийте меню ⋮ і виберіть «Додати на головний екран» або «Встановити застосунок».
          </p>
        )}
      </div>
    </section>
  );
}
