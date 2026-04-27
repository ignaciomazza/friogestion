"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { ToastContainer, toast } from "react-toastify";
import { EyeIcon, EyeSlashIcon } from "@/components/icons";
import { canAccessDashboard } from "@/lib/auth/rbac";
import "react-toastify/dist/ReactToastify.css";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      loginSchema.parse({ email, password });
    } catch {
      toast.error("Revisa correo y contraseña");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; role?: string }
        | null;

      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo iniciar sesion");
        return;
      }

      toast.success("Bienvenido/a");
      const fromPath = searchParams.get("from");
      const canOpenDashboard = canAccessDashboard(data?.role ?? null);
      const defaultPath = canOpenDashboard ? "/app" : "/app/quotes";
      const redirectTo =
        fromPath === "/app" && !canOpenDashboard
          ? "/app/quotes"
          : fromPath ?? defaultPath;
      router.push(redirectTo);
    } catch {
      toast.error("No se pudo iniciar sesion");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900">Frio Gestion</h1>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Ingresa con tu usuario para abrir la consola de gestion.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Correo
            </label>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@friogestion.local"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input w-full pr-10"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
              >
                {showPassword ? (
                  <EyeSlashIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-emerald w-full"
            disabled={isLoading}
          >
            {isLoading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>

      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
}
