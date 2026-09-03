"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean;
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function checkExistingSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setCheckingSession(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, email, role, active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        setCheckingSession(false);
        return;
      }

      redirectByRole(profile as Profile);
    }

    checkExistingSession();
  }, []);

  function redirectByRole(profile: Profile) {
    if (profile.role === "seller" || profile.role === "viewer") {
      router.replace("/catalogo");
      return;
    }

    router.replace("/");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setFeedback("Informe seu e-mail.");
      return;
    }

    if (!password) {
      setFeedback("Informe sua senha.");
      return;
    }

    setLoading(true);
    setFeedback("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data.user) {
        throw new Error(
          error?.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : error?.message || "Não foi possível entrar."
        );
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email, role, active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        await supabase.auth.signOut();
        throw new Error(
          `Não foi possível carregar o perfil deste usuário: ${profileError.message}`
        );
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error(
          "A conta existe no login, mas ainda não possui um perfil interno no sistema."
        );
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        throw new Error(
          "Este usuário está desativado. Solicite o acesso a um administrador."
        );
      }

      redirectByRole(profile as Profile);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro inesperado ao entrar."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="loading-page">
        <div className="loading-card">
          <Image
            src="/brand/camel-paper-logo.png"
            alt="Camel Paper"
            width={190}
            height={76}
            priority
          />
          <span>Verificando acesso...</span>
        </div>

        <style jsx>{`
          .loading-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f6f2ee;
          }

          .loading-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            color: #7f7169;
            font-size: 11px;
            font-weight: 800;
          }

          .loading-card :global(img) {
            width: 165px;
            height: 64px;
            object-fit: contain;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="brand-side">
        <div className="brand-content">
          <Image
            src="/brand/camel-paper-logo.png"
            alt="Camel Paper"
            width={300}
            height={120}
            priority
          />

          <div className="brand-copy">
            <span>CATÁLOGO INTERNO</span>
            <h1>Gestão comercial em um só lugar.</h1>
            <p>
              Produtos, categorias, catálogos personalizados e atendimento ao
              cliente conectados em uma única plataforma.
            </p>
          </div>
        </div>

        <div className="brand-footer">
          <span>Camel Paper</span>
          <small>Acesso restrito à equipe autorizada</small>
        </div>
      </section>

      <section className="form-side">
        <div className="login-card">
          <div className="mobile-logo">
            <Image
              src="/brand/camel-paper-logo.png"
              alt="Camel Paper"
              width={180}
              height={72}
              priority
            />
          </div>

          <span className="eyebrow">ACESSO INTERNO</span>
          <h2>Entrar no sistema</h2>
          <p className="intro">
            Use o e-mail e a senha cadastrados pelo administrador.
          </p>

          <form onSubmit={handleLogin}>
            <label>
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seuemail@empresa.com.br"
                disabled={loading}
              />
            </label>

            <label>
              <span>Senha</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </label>

            {feedback && <div className="feedback">{feedback}</div>}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar →"}
            </button>
          </form>

          <div className="login-note">
            <span>Seu acesso depende da função definida pelo administrador.</span>
          </div>
        </div>
      </section>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .login-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(440px, 0.95fr) minmax(480px, 1.05fr);
          background: #f7f4f1;
          color: #352821;
          font-family: Arial, sans-serif;
        }

        .brand-side {
          position: relative;
          overflow: hidden;
          padding: 58px 64px 42px;
          background:
            radial-gradient(
              circle at 80% 20%,
              rgba(239, 122, 0, 0.2),
              transparent 26%
            ),
            linear-gradient(145deg, #742112, #9a2f18 58%, #7d2113);
          color: #fff;
          display: flex;
          flex-direction: column;
        }

        .brand-side::after {
          content: "";
          position: absolute;
          width: 520px;
          height: 520px;
          right: -240px;
          bottom: -220px;
          border-radius: 50%;
          border: 90px solid rgba(239, 122, 0, 0.13);
        }

        .brand-content {
          position: relative;
          z-index: 2;
        }

        .brand-content :global(img) {
          width: 220px;
          height: 90px;
          object-fit: contain;
          object-position: left center;
          filter: brightness(0) invert(1);
        }

        .brand-copy {
          max-width: 570px;
          margin-top: 120px;
        }

        .brand-copy > span {
          color: #f5a862;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .brand-copy h1 {
          margin: 13px 0 0;
          font-size: clamp(45px, 5.5vw, 78px);
          line-height: 0.95;
          letter-spacing: -3.4px;
        }

        .brand-copy p {
          max-width: 480px;
          margin: 24px 0 0;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
          line-height: 1.65;
        }

        .brand-footer {
          position: relative;
          z-index: 2;
          margin-top: auto;
          padding-top: 25px;
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .brand-footer span {
          font-size: 11px;
          font-weight: 900;
        }

        .brand-footer small {
          color: rgba(255, 255, 255, 0.54);
          font-size: 8px;
        }

        .form-side {
          display: grid;
          place-items: center;
          padding: 42px;
        }

        .login-card {
          width: min(430px, 100%);
        }

        .mobile-logo {
          display: none;
        }

        .eyebrow {
          color: #ef7a00;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.7px;
        }

        h2 {
          margin: 8px 0 0;
          color: #3a2b25;
          font-size: 38px;
          line-height: 1;
          letter-spacing: -1.5px;
        }

        .intro {
          margin: 12px 0 28px;
          color: #887a72;
          font-size: 11px;
          line-height: 1.6;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        label > span {
          color: #605048;
          font-size: 9px;
          font-weight: 900;
        }

        input {
          width: 100%;
          min-height: 48px;
          border: 1px solid #ddd2cc;
          border-radius: 10px;
          background: #fff;
          color: #342722;
          padding: 0 13px;
          outline: none;
          font: inherit;
          font-size: 11px;
        }

        input:focus {
          border-color: #ef7a00;
          box-shadow: 0 0 0 3px rgba(239, 122, 0, 0.08);
        }

        input:disabled {
          opacity: 0.65;
        }

        .password-wrap {
          position: relative;
        }

        .password-wrap input {
          padding-right: 78px;
        }

        .show-password {
          position: absolute;
          right: 7px;
          top: 50%;
          transform: translateY(-50%);
          min-height: 34px;
          border: 0;
          border-radius: 8px;
          background: #f8f4f1;
          color: #8f2a18;
          padding: 0 9px;
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .feedback {
          padding: 10px 12px;
          border: 1px solid #efc9ae;
          border-radius: 9px;
          background: #fff5ed;
          color: #9b321d;
          font-size: 9px;
          line-height: 1.5;
          font-weight: 800;
        }

        .login-button {
          min-height: 50px;
          margin-top: 3px;
          border: 0;
          border-radius: 10px;
          background: #8f2a18;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(143, 42, 24, 0.16);
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-note {
          margin-top: 20px;
          padding-top: 17px;
          border-top: 1px solid #e7ddd7;
          color: #9a8d86;
          font-size: 8px;
          text-align: center;
        }

        @media (max-width: 900px) {
          .login-shell {
            grid-template-columns: 1fr;
          }

          .brand-side {
            display: none;
          }

          .form-side {
            min-height: 100vh;
            padding: 26px 18px;
          }

          .mobile-logo {
            display: block;
            margin-bottom: 34px;
          }

          .mobile-logo :global(img) {
            width: 150px;
            height: 60px;
            object-fit: contain;
            object-position: left center;
          }

          h2 {
            font-size: 34px;
          }
        }
      `}</style>
    </main>
  );
}
