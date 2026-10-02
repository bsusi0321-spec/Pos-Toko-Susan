"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_MENU_GROUPS, ADMIN_MENU_ITEMS } from "@/lib/adminMenu";

const TONE = {
  primary: "bg-primary-soft text-primary",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-background text-ink-muted",
};

function Tile({ href, label, icon: Icon, tone, highlight, onClick, danger }) {
  const box = highlight
    ? "bg-primary text-white"
    : danger
    ? "bg-danger-soft text-danger"
    : TONE[tone] || TONE.primary;
  const inner = (
    <>
      <span className={`flex h-16 w-16 sm:h-[72px] sm:w-[72px] items-center justify-center rounded-2xl ${box}`}>
        <Icon size={34} strokeWidth={1.8} />
      </span>
      <span className={`text-sm font-medium leading-snug text-center line-clamp-2 ${danger ? "text-danger" : ""}`}>{label}</span>
    </>
  );
  const cls =
    "flex flex-col items-center justify-start gap-2.5 rounded-2xl border border-border bg-surface px-2 py-4 min-h-[136px] " +
    "transition hover:border-primary/50 hover:shadow-sm active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export default function MenuHome() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Menu Utama</h1>
        <p className="text-sm text-ink-muted mt-1">Ketuk ikon untuk membuka halamannya.</p>
      </div>

      <div className="space-y-7">
        {ADMIN_MENU_GROUPS.map((g) => {
          const items = ADMIN_MENU_ITEMS.filter((i) => i.group === g.key);
          if (items.length === 0) return null;
          return (
            <section key={g.key}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">{g.title}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                {items.map((item) => (
                  <Tile key={item.href} href={item.href} label={item.label} icon={item.icon} tone={g.tone} highlight={item.highlight} />
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Tile label="Keluar" icon={LogOut} danger onClick={handleLogout} />
          </div>
        </section>
      </div>
    </div>
  );
}
