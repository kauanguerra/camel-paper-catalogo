"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "commercial", label: "Comercial" },
  { value: "seller", label: "Vendedor" },
  { value: "viewer", label: "Visualização" },
];

export default function UsuariosPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingRole, setEditingRole] = useState("seller");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("seller");
  const [creatingUser, setCreatingUser] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    setLoading(true);
    setFeedback("");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, role, active, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      setFeedback(`Não foi possível carregar os usuários: ${error.message}`);
      setProfiles([]);
    } else {
      setProfiles((data || []) as Profile[]);
    }

    setLoading(false);
  }

  function roleLabel(role: string | null) {
    return (
      ROLE_OPTIONS.find((option) => option.value === role)?.label ||
      role ||
      "Sem função"
    );
  }

  function startEdit(profile: Profile) {
    setEditingId(profile.id);
    setEditingName(profile.name || "");
    setEditingRole(profile.role || "seller");
    setFeedback("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingRole("seller");
  }

  async function saveEdit(profile: Profile) {
    if (!editingName.trim()) {
      setFeedback("Informe o nome do usuário.");
      return;
    }

    setSavingId(profile.id);
    setFeedback("");

    const { error } = await supabase
      .from("profiles")
      .update({
        name: editingName.trim(),
        role: editingRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setFeedback(`Não foi possível atualizar o usuário: ${error.message}`);
      setSavingId(null);
      return;
    }

    setProfiles((current) =>
      current.map((item) =>
        item.id === profile.id
          ? {
              ...item,
              name: editingName.trim(),
              role: editingRole,
              updated_at: new Date().toISOString(),
            }
          : item
      )
    );

    cancelEdit();
    setFeedback("Usuário atualizado com sucesso.");
    setSavingId(null);
  }

  async function toggleActive(profile: Profile) {
    setSavingId(profile.id);
    setFeedback("");

    const nextActive = !profile.active;

    const { error } = await supabase
      .from("profiles")
      .update({
        active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setFeedback(`Não foi possível alterar o status: ${error.message}`);
      setSavingId(null);
      return;
    }

    setProfiles((current) =>
      current.map((item) =>
        item.id === profile.id ? { ...item, active: nextActive } : item
      )
    );

    setFeedback(nextActive ? "Usuário ativado." : "Usuário desativado.");
    setSavingId(null);
  }

  async function createUser() {
    if (!newUserName.trim()) {
      setFeedback("Informe o nome do novo usuário.");
      return;
    }

    if (!newUserEmail.trim()) {
      setFeedback("Informe o e-mail do novo usuário.");
      return;
    }

    if (newUserPassword.length < 6) {
      setFeedback("A senha inicial precisa ter pelo menos 6 caracteres.");
      return;
    }

    setCreatingUser(true);
    setFeedback("");

    try {
      const response = await fetch("/api/usuarios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Não foi possível criar o usuário.");
      }

      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("seller");
      setShowNewUser(false);
      setFeedback("Usuário criado com sucesso.");

      await loadProfiles();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Erro inesperado ao criar usuário."
      );
    } finally {
      setCreatingUser(false);
    }
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

  const filteredProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "active" && profile.active) ||
        (statusFilter === "inactive" && !profile.active);

      const text = `${profile.name || ""} ${profile.email || ""} ${profile.role || ""}`.toLowerCase();

      return statusMatch && (!normalized || text.includes(normalized));
    });
  }, [profiles, query, statusFilter]);

  const activeUsers = profiles.filter((profile) => profile.active).length;
  const adminUsers = profiles.filter((profile) => profile.role === "admin").length;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Image
            src="/brand/camel-paper-logo.png"
            alt="Camel Paper"
            width={180}
            height={90}
            priority
          />
        </div>

        <nav>
          <Link href="/" className="nav">
            ▦ <span>Produtos</span>
          </Link>
          <Link href="/categorias" className="nav">
            ▤ <span>Categorias</span>
          </Link>
          <Link href="/catalogos" className="nav">
            ◫ <span>Catálogos</span>
          </Link>
          <Link href="/usuarios" className="nav active">
            ♙ <span>Usuários</span>
          </Link>
        </nav>

        <div className="admin account-footer">
          <div className="account-user">
            <div className="avatar">KG</div>
            <div>
              <strong>Administrador</strong>
              <small>Camel Paper</small>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-logout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <span>↪</span>
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ACESSO INTERNO</p>
            <h1>Usuários</h1>
            <p className="muted">
              Gerencie os perfis internos, e-mails, funções e status de acesso ao sistema.
            </p>
          </div>

          <button
            type="button"
            className="new-user-button"
            onClick={() => {
              setShowNewUser(true);
              setFeedback("");
            }}
          >
            ＋ Novo usuário
          </button>
        </header>

        <div className="stats">
          <div>
            <b>{profiles.length}</b>
            <span>Usuários cadastrados</span>
          </div>
          <div>
            <b>{activeUsers}</b>
            <span>Usuários ativos</span>
          </div>
          <div>
            <b>{adminUsers}</b>
            <span>Administradores</span>
          </div>
        </div>

        <section className="security-note">
          <div>
            <span>SEGURANÇA</span>
            <strong>Gestão de perfis</strong>
          </div>
          <p>
            Esta página administra os perfis internos e cria novas contas no <b>Supabase Auth</b>
            vinculadas automaticamente à tabela <b>profiles</b>.
          </p>
        </section>

        {feedback && (
          <div className="feedback">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback("")}>
              ×
            </button>
          </div>
        )}

        <section className="toolbar-card">
          <div className="search-wrap">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, e-mail ou função..."
            />
          </div>

          <div className="filters">
            <button
              type="button"
              className={statusFilter === "all" ? "active" : ""}
              onClick={() => setStatusFilter("all")}
            >
              Todos
            </button>
            <button
              type="button"
              className={statusFilter === "active" ? "active" : ""}
              onClick={() => setStatusFilter("active")}
            >
              Ativos
            </button>
            <button
              type="button"
              className={statusFilter === "inactive" ? "active" : ""}
              onClick={() => setStatusFilter("inactive")}
            >
              Inativos
            </button>
          </div>
        </section>

        <section className="table-card">
          <div className="table-head">
            <span>Usuário</span>
            <span>Função</span>
            <span>Status</span>
            <span>Criado em</span>
            <span>Ações</span>
          </div>

          {loading ? (
            <div className="empty">Carregando usuários...</div>
          ) : filteredProfiles.length === 0 ? (
            <div className="empty">Nenhum usuário encontrado.</div>
          ) : (
            filteredProfiles.map((profile) => (
              <div className="table-row" key={profile.id}>
                <div className="user-cell">
                  <div className="user-avatar">
                    {(profile.name || "U").slice(0, 1).toUpperCase()}
                  </div>

                  <div>
                    {editingId === profile.id ? (
                      <input
                        className="edit-input"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        placeholder="Nome do usuário"
                        autoFocus
                      />
                    ) : (
                      <>
                        <strong>{profile.name || "Nome não informado"}</strong>
                        <small>{profile.email || "E-mail não informado"}</small>
                      </>
                    )}
                  </div>
                </div>

                <div className="role-cell">
                  {editingId === profile.id ? (
                    <select
                      value={editingRole}
                      onChange={(event) => setEditingRole(event.target.value)}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`role-badge role-${profile.role || "default"}`}>
                      {roleLabel(profile.role)}
                    </span>
                  )}
                </div>

                <div>
                  <span
                    className={profile.active ? "status active-status" : "status"}
                  >
                    ● {profile.active ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <div className="date-cell">
                  {profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString("pt-BR")
                    : "—"}
                </div>

                <div className="actions">
                  {editingId === profile.id ? (
                    <>
                      <button
                        type="button"
                        className="primary-small"
                        onClick={() => saveEdit(profile)}
                        disabled={savingId === profile.id}
                      >
                        {savingId === profile.id ? "Salvando..." : "Salvar"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingId === profile.id}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(profile)}>
                        Editar
                      </button>

                      <button
                        type="button"
                        className={profile.active ? "danger" : "primary-small"}
                        onClick={() => toggleActive(profile)}
                        disabled={savingId === profile.id}
                      >
                        {savingId === profile.id
                          ? "Aguarde..."
                          : profile.active
                            ? "Desativar"
                            : "Ativar"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </section>

      {showNewUser && (
        <div
          className="new-user-backdrop"
          onClick={() => !creatingUser && setShowNewUser(false)}
        >
          <section
            className="new-user-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Criar novo usuário"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="new-user-header">
              <div>
                <span>NOVO ACESSO</span>
                <h2>Criar usuário</h2>
                <p>
                  O usuário será criado no Supabase Auth e também registrado em profiles.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewUser(false)}
                disabled={creatingUser}
              >
                ×
              </button>
            </div>

            <div className="new-user-grid">
              <label>
                <span>Nome</span>
                <input
                  value={newUserName}
                  onChange={(event) => setNewUserName(event.target.value)}
                  placeholder="Ex.: Maria Silva"
                />
              </label>

              <label>
                <span>E-mail</span>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  placeholder="maria@empresa.com.br"
                />
              </label>

              <label>
                <span>Senha inicial</span>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                />
              </label>

              <label>
                <span>Função</span>
                <select
                  value={newUserRole}
                  onChange={(event) => setNewUserRole(event.target.value)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="new-user-note">
              <strong>Como funciona</strong>
              <span>
                A conta será criada com o e-mail já confirmado. Depois, você poderá
                alterar a função ou desativar o usuário nesta mesma tela.
              </span>
            </div>

            <div className="new-user-actions">
              <button
                type="button"
                onClick={() => setShowNewUser(false)}
                disabled={creatingUser}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="confirm"
                onClick={createUser}
                disabled={creatingUser}
              >
                {creatingUser ? "Criando usuário..." : "Criar usuário →"}
              </button>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .shell {
          min-height: 100vh;
          background: #f7f4f1;
          color: #352821;
          font-family: Arial, sans-serif;
          display: grid;
          grid-template-columns: 245px 1fr;
        }

        .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          background: #fff;
          border-right: 1px solid #e9dfd9;
          padding: 28px 22px;
          display: flex;
          flex-direction: column;
        }

        .brand {
          height: 120px;
          display: flex;
          align-items: center;
        }

        .brand :global(img) {
          width: 125px;
          height: auto;
          object-fit: contain;
        }

        nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 28px;
        }

        :global(.nav) {
          min-height: 48px;
          border-radius: 12px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 13px;
          color: #685d57;
          text-decoration: none;
          font-weight: 800;
          font-size: 14px;
        }

        :global(.nav.active) {
          background: #fff0e1;
          color: #8f2a18;
        }

        .admin {
          margin-top: auto;
          border-top: 1px solid #eee4de;
          padding-top: 20px;
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .account-footer {
          flex-direction: column;
          align-items: stretch;
          gap: 11px;
        }

        .account-user {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .sidebar-logout {
          width: 100%;
          min-height: 36px;
          border: 1px solid #eadbd4;
          border-radius: 9px;
          background: #fff8f4;
          color: #8f2a18;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease;
        }

        .sidebar-logout:hover:not(:disabled) {
          background: #fff0e8;
          border-color: #e3c2b5;
        }

        .sidebar-logout:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .sidebar-logout span {
          font-size: 13px;
        }

        .avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #8f2a18;
          color: #fff;
          display: grid;
          place-items: center;
          font-weight: 900;
        }

        .admin strong,
        .admin small {
          display: block;
        }

        .admin small {
          color: #9a8d86;
          margin-top: 3px;
        }

        .content {
          padding: 42px 54px;
          max-width: 1450px;
          width: 100%;
        }

        .eyebrow {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.8px;
          color: #ef7a00;
          margin: 0 0 7px;
        }

        h1 {
          font-size: 38px;
          margin: 0;
          letter-spacing: -1.3px;
        }

        .muted {
          color: #81756f;
          margin: 8px 0 0;
          font-size: 14px;
        }

        header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .new-user-button {
          min-height: 42px;
          padding: 0 15px;
          border: 0;
          border-radius: 10px;
          background: #8f2a18;
          color: #fff;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .new-user-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          padding: 24px;
          background: rgba(39, 27, 22, 0.64);
          backdrop-filter: blur(5px);
          display: grid;
          place-items: center;
        }

        .new-user-modal {
          width: min(680px, 96vw);
          max-height: 92vh;
          overflow: auto;
          background: #fff;
          border: 1px solid #e4dad4;
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 28px 85px rgba(37, 25, 20, 0.24);
        }

        .new-user-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #eee5df;
        }

        .new-user-header > div > span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.3px;
        }

        .new-user-header h2 {
          margin: 5px 0 0;
          color: #352821;
          font-size: 23px;
        }

        .new-user-header p {
          margin: 6px 0 0;
          color: #867970;
          font-size: 9px;
          line-height: 1.5;
        }

        .new-user-header > button {
          width: 34px;
          height: 34px;
          min-height: 34px;
          border-radius: 50%;
          border: 1px solid #dfd4ce;
          background: #fff;
          color: #75665e;
          font-size: 18px;
          cursor: pointer;
        }

        .new-user-grid {
          margin-top: 17px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .new-user-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .new-user-grid label > span {
          color: #625149;
          font-size: 9px;
          font-weight: 900;
        }

        .new-user-grid input,
        .new-user-grid select {
          width: 100%;
          min-height: 42px;
          box-sizing: border-box;
          border: 1px solid #ddd3cd;
          border-radius: 9px;
          background: #fff;
          color: #352821;
          padding: 0 11px;
          outline: none;
          font: inherit;
          font-size: 10px;
        }

        .new-user-grid input:focus,
        .new-user-grid select:focus {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239, 122, 0, 0.08);
        }

        .new-user-note {
          margin-top: 15px;
          padding: 12px;
          border: 1px solid #efd4bd;
          border-radius: 10px;
          background: #fff8f2;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .new-user-note strong {
          color: #8f2a18;
          font-size: 9px;
        }

        .new-user-note span {
          color: #806f66;
          font-size: 8px;
          line-height: 1.5;
        }

        .new-user-actions {
          margin-top: 18px;
          padding-top: 15px;
          border-top: 1px solid #eee5df;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .new-user-actions button {
          min-height: 40px;
          padding: 0 14px;
          border-radius: 9px;
          border: 1px solid #ddd3cd;
          background: #fff;
          color: #74665f;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .new-user-actions .confirm {
          border-color: #8f2a18;
          background: #8f2a18;
          color: #fff;
        }

        .new-user-actions button:disabled,
        .new-user-header > button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin: 28px 0 14px;
        }

        .stats > div,
        .security-note,
        .toolbar-card,
        .table-card {
          background: #fff;
          border: 1px solid #e5dbd5;
          border-radius: 16px;
        }

        .stats > div {
          padding: 18px;
        }

        .stats b {
          display: block;
          font-size: 26px;
          color: #8f2a18;
        }

        .stats span {
          font-size: 11px;
          color: #8b7f78;
        }

        .security-note {
          padding: 16px 18px;
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 18px;
          align-items: center;
          background: #fff9f3;
          border-color: #efcfb2;
          margin-bottom: 14px;
        }

        .security-note > div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .security-note > div span {
          color: #ef7a00;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .security-note > div strong {
          color: #8f2a18;
          font-size: 14px;
        }

        .security-note p {
          margin: 0;
          color: #776961;
          font-size: 10px;
          line-height: 1.55;
        }

        .feedback {
          margin: 12px 0;
          background: #fff7ef;
          border: 1px solid #f0d0b4;
          color: #8f2a18;
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 700;
          font-size: 12px;
        }

        .feedback button {
          min-height: 25px;
          border: 0;
          background: transparent;
          color: #8f2a18;
          font-size: 16px;
          cursor: pointer;
        }

        .toolbar-card {
          margin-bottom: 14px;
          padding: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .search-wrap {
          width: min(480px, 100%);
          min-height: 42px;
          border: 1px solid #ddd2cc;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
        }

        .search-wrap > span {
          color: #8f2a18;
          font-weight: 900;
        }

        .search-wrap input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: none;
          background: transparent;
          font: inherit;
        }

        .filters {
          display: flex;
          gap: 7px;
        }

        .filters button {
          min-height: 34px;
          border-radius: 999px;
          padding: 0 12px;
          border: 1px solid #ddd2cc;
          background: #fff;
          color: #786a62;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .filters button.active {
          background: #ef7a00;
          color: #fff;
          border-color: #ef7a00;
        }

        .table-card {
          overflow: hidden;
        }

        .table-head,
        .table-row {
          display: grid;
          grid-template-columns: minmax(280px, 1.4fr) 180px 130px 130px 250px;
          gap: 14px;
          align-items: center;
          padding: 14px 18px;
        }

        .table-head {
          background: #faf7f4;
          color: #988a83;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }

        .table-row {
          min-height: 78px;
          border-top: 1px solid #eee5df;
        }

        .user-cell {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .user-avatar {
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          border-radius: 11px;
          background: #fff1e6;
          color: #8f2a18;
          display: grid;
          place-items: center;
          font-weight: 900;
        }

        .user-cell > div:last-child {
          min-width: 0;
        }

        .user-cell strong,
        .user-cell small {
          display: block;
        }

        .user-cell strong {
          color: #44342d;
          font-size: 12px;
        }

        .user-cell small {
          color: #9a8d86;
          font-size: 8px;
          margin-top: 3px;
        }

        .role-badge {
          width: fit-content;
          padding: 5px 8px;
          border-radius: 999px;
          background: #f4f0ed;
          color: #6c5c54;
          font-size: 8px;
          font-weight: 900;
        }

        .role-admin {
          background: #fff0e3;
          color: #8f2a18;
        }

        .role-commercial {
          background: #fff7d8;
          color: #80610a;
        }

        .role-seller {
          background: #edf6ff;
          color: #3e6f95;
        }

        .role-viewer {
          background: #f1f1f1;
          color: #6d6d6d;
        }

        .status {
          font-size: 10px;
          font-weight: 800;
          color: #948780;
        }

        .active-status {
          color: #3d8d58;
        }

        .date-cell {
          color: #6f625b;
          font-size: 10px;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 7px;
        }

        .actions button {
          min-height: 36px;
          border: 1px solid #ded2cc;
          background: #fff;
          color: #8f2a18;
          border-radius: 9px;
          padding: 0 12px;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .actions .primary-small {
          background: #8f2a18;
          color: #fff;
          border-color: #8f2a18;
        }

        .actions .danger {
          background: #fff5f1;
          color: #a43a28;
        }

        .actions button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .edit-input,
        select {
          width: 100%;
          min-height: 40px;
          border: 1px solid #ddd2cc;
          border-radius: 9px;
          padding: 0 10px;
          background: #fff;
          color: #352821;
          outline: none;
          font: inherit;
          font-size: 10px;
        }

        .edit-input:focus,
        select:focus {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239,122,0,.08);
        }

        .empty {
          min-height: 220px;
          padding: 40px;
          display: grid;
          place-items: center;
          color: #8e817a;
          font-size: 11px;
        }

        @media (max-width: 1000px) {
          .shell {
            grid-template-columns: 1fr;
          }

          .sidebar {
            position: relative;
            height: auto;
          }

          .content {
            padding: 25px 18px;
          }

          .stats {
            grid-template-columns: 1fr;
          }

          .security-note {
            grid-template-columns: 1fr;
          }

          .toolbar-card {
            align-items: stretch;
            flex-direction: column;
          }

          .table-card {
            overflow-x: auto;
          }

          .table-head,
          .table-row {
            min-width: 980px;
          }

          header {
            flex-direction: column;
          }

          .new-user-backdrop {
            padding: 10px;
          }

          .new-user-grid {
            grid-template-columns: 1fr;
          }

          .new-user-actions {
            flex-direction: column-reverse;
          }

          .new-user-actions button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
