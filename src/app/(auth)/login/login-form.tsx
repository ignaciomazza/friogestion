"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { ToastContainer, toast } from "react-toastify";
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

      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error ?? "No se pudo iniciar sesion");
        return;
      }

      toast.success("Bienvenido/a");
      const redirectTo = searchParams.get("from") ?? "/app";
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
            <input
              type="password"
              className="input w-full"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              required
            />
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
