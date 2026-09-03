"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  FilePlus2,
  LibraryBig,
  LogOut,
  Package,
  Tags,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean;
};

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  exact?: boolean;
  roles: string[];
};

const menuGroups: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: "",
    items: [
      { href: "/", label: "Produtos", icon: Package, exact: true, roles: ["admin", "commercial"] },
      { href: "/categorias", label: "Categorias", icon: Tags, exact: true, roles: ["admin", "commercial"] },
    ],
  },
  {
    label: "CATÁLOGOS",
    items: [
      { href: "/catalogos", label: "Criar catálogo", icon: FilePlus2, exact: true, roles: ["admin", "commercial"] },
      { href: "/catalogos/gerenciar", label: "Central de catálogos", icon: LibraryBig, roles: ["admin", "commercial"] },
      { href: "/catalogo", label: "Catálogo de vendedor", icon: BriefcaseBusiness, roles: ["admin", "commercial", "seller", "viewer"] },
    ],
  },
  {
    label: "GESTÃO",
    items: [
      { href: "/usuarios", label: "Usuários", icon: UsersRound, roles: ["admin"] },
    ],
  },
];

function roleLabel(role: string | null) {
  switch (role) {
    case "admin": return "Administrador";
    case "commercial": return "Comercial";
    case "seller": return "Vendedor";
    case "viewer": return "Visualização";
    default: return "Usuário";
  }
}

function initials(name: string | null) {
  const value = (name || "Camel Paper").trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("id,name,email,role,active")
        .eq("id", user.id)
        .maybeSingle();

      if (mounted && data) setProfile(data as Profile);
    }

    loadProfile();
    return () => { mounted = false; };
  }, []);

  const currentRole = profile?.role || "admin";

  const visibleGroups = useMemo(
    () =>
      menuGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.roles.includes(currentRole)),
        }))
        .filter((group) => group.items.length > 0),
    [currentRole]
  );

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <Image
          src="/brand/camel-colorido.svg"
          alt="Camel Paper"
          width={180}
          height={90}
          priority
        />
      </div>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {visibleGroups.map((group, index) => (
          <div className="sidebar-group" key={`${group.label}-${index}`}>
            {group.label && <span className="sidebar-group-label">{group.label}</span>}
            <div className="sidebar-group-items">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="active-rail" />
                    <span className="sidebar-icon">
                      <Icon size={17} strokeWidth={1.9} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-account">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials(profile?.name || null)}</div>
          <div className="sidebar-user-copy">
            <strong>{profile?.name || roleLabel(profile?.role || null)}</strong>
            <small>{roleLabel(profile?.role || null)} · Camel Paper</small>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-logout"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          <LogOut size={14} strokeWidth={2} />
          {signingOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>

      <style jsx>{`
        .app-sidebar{
          position:sticky;top:0;height:100vh;min-width:0;
          background:radial-gradient(circle at 15% 3%,rgba(239,122,0,.055),transparent 22%),#fff;
          border-right:1px solid #eadfd8;padding:18px 16px;display:flex;flex-direction:column;overflow:hidden
        }
        .sidebar-brand{min-height:112px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #eee4de;margin-bottom:18px}
        .sidebar-brand :global(img){width:142px;height:auto;object-fit:contain;transition:transform .28s ease}
        .sidebar-brand:hover :global(img){transform:translateY(-1px) scale(1.015)}
        .sidebar-nav{display:flex;flex-direction:column;gap:18px}
        .sidebar-group{display:flex;flex-direction:column;gap:7px}
        .sidebar-group-label{padding:0 11px;color:#b0a19a;font-size:8px;font-weight:900;letter-spacing:1.7px}
        .sidebar-group-items{display:flex;flex-direction:column;gap:5px}
        :global(.sidebar-link){
          position:relative;min-height:45px;border:1px solid transparent;border-radius:12px;
          padding:5px 10px 5px 11px;display:flex;align-items:center;gap:11px;color:#665a54;
          text-decoration:none;font-size:12px;font-weight:800;line-height:1.15;
          transition:transform .18s ease,background .18s ease,color .18s ease,border-color .18s ease,box-shadow .18s ease
        }
        :global(.sidebar-link:hover){transform:translateX(2px);background:#fff8f2;color:#8f2a18;border-color:#f2e1d6}
        :global(.sidebar-icon){
          width:29px;height:29px;flex:0 0 29px;border-radius:9px;display:grid;place-items:center;
          color:#9b8c84;background:#faf6f3;border:1px solid #eee2dc;
          transition:transform .2s ease,color .2s ease,background .2s ease,border-color .2s ease
        }
        :global(.sidebar-link:hover .sidebar-icon){transform:scale(1.06);color:#c65318}
        :global(.sidebar-link.is-active){
          color:#8f2a18;background:linear-gradient(90deg,#fff0e2 0%,#fff8f2 100%);
          border-color:#f0ccb6;box-shadow:0 8px 20px rgba(143,42,24,.055)
        }
        :global(.sidebar-link.is-active .sidebar-icon){color:#fff;background:#e96516;border-color:#e96516;box-shadow:0 5px 12px rgba(233,101,22,.18)}
        :global(.active-rail){position:absolute;left:6px;width:3px;height:21px;border-radius:999px;background:#ef7a00;opacity:0;transform:scaleY(.45);transition:opacity .2s ease,transform .2s ease}
        :global(.sidebar-link.is-active .active-rail){opacity:1;transform:scaleY(1)}
        .sidebar-account{margin-top:auto;border:1px solid #eadbd4;border-radius:14px;background:rgba(255,252,249,.96);padding:10px;box-shadow:0 8px 22px rgba(76,47,34,.045)}
        .sidebar-user{display:flex;align-items:center;gap:9px;padding:0 1px 9px}
        .sidebar-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(145deg,#ef7a00,#8f2a18);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 0 0 1px #e3cfc4}
        .sidebar-user-copy{min-width:0}
        .sidebar-user-copy strong,.sidebar-user-copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sidebar-user-copy strong{color:#392b25;font-size:11px}
        .sidebar-user-copy small{color:#958780;font-size:8px;margin-top:3px}
        .sidebar-logout{width:100%;min-height:34px;border:1px solid #eadbd4;border-radius:9px;background:#fff8f4;color:#8f2a18;display:flex;align-items:center;justify-content:center;gap:7px;font-size:9px;font-weight:900;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease}
        .sidebar-logout:hover:not(:disabled){transform:translateY(-1px);background:#fff0e8;border-color:#e3c2b5}
        .sidebar-logout:disabled{opacity:.55;cursor:not-allowed}
        @media(max-width:900px){
          .app-sidebar{position:relative;height:auto}
          .sidebar-nav{gap:12px}
          .sidebar-account{margin-top:16px}
        }
        @media(prefers-reduced-motion:reduce){
          :global(.sidebar-link),:global(.sidebar-icon),.sidebar-brand :global(img),:global(.active-rail),.sidebar-logout{transition:none!important}
        }
      `}</style>
    </aside>
  );
}
