import { Suspense } from "react";
import LoginForm from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="card w-full max-w-md">
            <p className="text-sm text-zinc-500">Cargando...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
