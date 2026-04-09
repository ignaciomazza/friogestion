"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BuildingOffice2Icon,
  ChartBarIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  UsersIcon,
} from "@/components/icons";
import { ROLE_OPTIONS, roleLabel } from "@/lib/labels";

type OrganizationSummary = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  role: string;
  createdAt: string;
  counts: {
    users: number;
    products: number;
    customers: number;
    sales: number;
  };
};

type DeveloperClientProps = {
  currentUserEmail: string;
  activeOrgId: string;
  activeRole: string;
  canCreateOrganizations: boolean;
  organizations: OrganizationSummary[];
};

type TestResult = {
  label: string;
  ok: boolean;
  status: number;
  durationMs: number;
  detail: string;
};

function formatErrorDetail(raw: unknown) {
  if (!raw || typeof raw !== "object") return "Error inesperado";
  if ("error" in raw && typeof raw.error === "string") return raw.error;
  return "Error inesperado";
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function DeveloperClient({
  currentUserEmail,
  activeOrgId,
  activeRole,
  canCreateOrganizations,
  organizations,
}: DeveloperClientProps) {
  const router = useRouter();
  const manageableOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) =>
          organization.role === "OWNER" || organization.role === "ADMIN"
      ),
    [organizations]
  );

  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testSummary, setTestSummary] = useState<string | null>(null);

  const [newAgencyName, setNewAgencyName] = useState("");
  const [newAgencyLegalName, setNewAgencyLegalName] = useState("");
  const [newAgencyTaxId, setNewAgencyTaxId] = useState("");
  const [agencyStatus, setAgencyStatus] = useState<string | null>(null);
  const [isCreatingAgency, setIsCreatingAgency] = useState(false);

  const [selectedOrgId, setSelectedOrgId] = useState(
    manageableOrganizations[0]?.id ?? activeOrgId
  );
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<(typeof ROLE_OPTIONS)[number]>(
    "SALES"
  );
  const [newUserPassword, setNewUserPassword] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const [developerEmail, setDeveloperEmail] = useState("developer@friogestion.com");
  const [developerName, setDeveloperName] = useState("Developer");
  const [developerPassword, setDeveloperPassword] = useState("");
  const [developerCompanyName, setDeveloperCompanyName] = useState(
    "Frio Gestion Developer Lab"
  );
  const [developerCompanyLegalName, setDeveloperCompanyLegalName] = useState("");
  const [developerCompanyTaxId, setDeveloperCompanyTaxId] = useState("");
  const [grantCurrentAccess, setGrantCurrentAccess] = useState(true);
  const [isBootstrappingDeveloper, setIsBootstrappingDeveloper] = useState(false);
  const [developerStatus, setDeveloperStatus] = useState<string | null>(null);
  const [developerTemporaryPassword, setDeveloperTemporaryPassword] = useState<
    string | null
  >(null);

  const hasManageableOrgs = manageableOrganizations.length > 0;

  const runTests = async () => {
    setIsRunningTests(true);
    setTestSummary(null);
    setTestResults([]);

    const checks = [
      { label: "Healthcheck", path: "/api/health" },
      { label: "Sesion", path: "/api/auth/me" },
      { label: "Agencias", path: "/api/admin/organizations" },
      { label: "AFIP/ARCA", path: "/api/afip/status" },
    ];

    try {
      const results = await Promise.all(
        checks.map(async (check) => {
          const started = performance.now();
          const response = await fetch(check.path, { cache: "no-store" });
          const durationMs = Math.round(performance.now() - started);
          const data = await safeJson(response);
          const detail = response.ok
            ? "OK"
            : formatErrorDetail(data ?? { error: "Error inesperado" });

          return {
            label: check.label,
            ok: response.ok,
            status: response.status,
            durationMs,
            detail,
          } satisfies TestResult;
        })
      );

      setTestResults(results);
      const okCount = results.filter((result) => result.ok).length;
      setTestSummary(`Checks OK: ${okCount}/${results.length}`);
    } catch {
      setTestSummary("No se pudieron ejecutar los checks");
    } finally {
      setIsRunningTests(false);
    }
  };

  const switchToOrganization = async (organizationId: string) => {
    const response = await fetch("/api/auth/switch-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const data = await safeJson(response);
      throw new Error(formatErrorDetail(data ?? { error: "No se pudo cambiar" }));
    }
  };

  const handleSwitchOrganization = async (organizationId: string) => {
    setSwitchingOrgId(organizationId);
    try {
      await switchToOrganization(organizationId);
      router.refresh();
    } catch (error) {
      setAgencyStatus(error instanceof Error ? error.message : "No se pudo cambiar");
    } finally {
      setSwitchingOrgId(null);
    }
  };

  const handleCreateAgency = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateOrganizations) {
      setAgencyStatus("Solo OWNER puede crear agencias");
      return;
    }

    setIsCreatingAgency(true);
    setAgencyStatus(null);

    try {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAgencyName.trim(),
          legalName: newAgencyLegalName.trim() || undefined,
          taxId: newAgencyTaxId.trim() || undefined,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        setAgencyStatus(formatErrorDetail(data));
        return;
      }

      const organizationId =
        data && typeof data === "object" && "id" in data && typeof data.id === "string"
          ? data.id
          : null;

      if (organizationId) {
        await switchToOrganization(organizationId);
      }

      setNewAgencyName("");
      setNewAgencyLegalName("");
      setNewAgencyTaxId("");
      setAgencyStatus("Agencia creada y activada");
      router.refresh();
    } catch {
      setAgencyStatus("No se pudo crear la agencia");
    } finally {
      setIsCreatingAgency(false);
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasManageableOrgs) {
      setUserStatus("No tenes agencias con permisos de gestion");
      return;
    }

    setIsCreatingUser(true);
    setUserStatus(null);

    try {
      if (selectedOrgId && selectedOrgId !== activeOrgId) {
        await switchToOrganization(selectedOrgId);
      }

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail.trim(),
          name: newUserName.trim() || undefined,
          role: newUserRole,
          password: newUserPassword.trim() || undefined,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        setUserStatus(formatErrorDetail(data));
        return;
      }

      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      setNewUserRole("SALES");
      setUserStatus("Usuario creado");
      router.refresh();
    } catch {
      setUserStatus("No se pudo crear el usuario");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleBootstrapDeveloper = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateOrganizations) {
      setDeveloperStatus("Solo OWNER puede bootstrapear un developer");
      return;
    }

    setIsBootstrappingDeveloper(true);
    setDeveloperStatus(null);
    setDeveloperTemporaryPassword(null);

    try {
      const response = await fetch("/api/admin/developer-bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: developerEmail.trim(),
          name: developerName.trim() || undefined,
          password: developerPassword.trim() || undefined,
          organizationName: developerCompanyName.trim(),
          organizationLegalName: developerCompanyLegalName.trim() || undefined,
          organizationTaxId: developerCompanyTaxId.trim() || undefined,
          grantCurrentUserAccess: grantCurrentAccess,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        setDeveloperStatus(formatErrorDetail(data));
        return;
      }

      const message =
        data && typeof data === "object" && "message" in data && typeof data.message === "string"
          ? data.message
          : "Bootstrap completado";
      const temporaryPassword =
        data &&
        typeof data === "object" &&
        "temporaryPassword" in data &&
        typeof data.temporaryPassword === "string"
          ? data.temporaryPassword
          : null;

      setDeveloperStatus(message);
      setDeveloperTemporaryPassword(temporaryPassword);
      setDeveloperPassword("");
      router.refresh();
    } catch {
      setDeveloperStatus("No se pudo bootstrapear el usuario developer");
    } finally {
      setIsBootstrappingDeveloper(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="card flex flex-col gap-3 border-dashed border-sky-200 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="section-title">Developer Panel</p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Operacion tecnica y bootstrap
          </h1>
          <p className="section-subtitle">
            Sesion: {currentUserEmail} · Rol activo: {roleLabel(activeRole)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runTests}
            className="btn btn-sky"
            disabled={isRunningTests}
          >
            <ChartBarIcon className="size-4" />
            {isRunningTests ? "Corriendo checks..." : "Correr checks"}
          </button>
          <Link href="/app/admin" className="btn btn-indigo">
            <Cog6ToothIcon className="size-4" />
            Abrir administracion
          </Link>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="card space-y-4">
          <div className="flex items-center gap-2">
            <InformationCircleIcon className="size-4 text-zinc-500" />
            <h2 className="text-base font-semibold text-zinc-900">Checks de entorno</h2>
          </div>
          <p className="section-subtitle">
            Ejecuta pruebas de salud de API y autenticacion para validar la instancia.
          </p>

          {testSummary ? (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {testSummary}
            </p>
          ) : null}

          <div className="space-y-2">
            {testResults.length ? (
              testResults.map((result) => (
                <div
                  key={result.label}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    result.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  <p className="font-medium">
                    {result.label}: {result.status} · {result.durationMs}ms
                  </p>
                  <p className="text-xs opacity-90">{result.detail}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500">
                Todavia no corriste checks en esta sesion.
              </p>
            )}
          </div>
        </article>

        <article className="card space-y-4">
          <div className="flex items-center gap-2">
            <BuildingOffice2Icon className="size-4 text-zinc-500" />
            <h2 className="text-base font-semibold text-zinc-900">Alta de agencia</h2>
          </div>
          <p className="section-subtitle">
            Crea una nueva agencia con datos iniciales y activala para configuracion.
          </p>

          <form onSubmit={handleCreateAgency} className="grid gap-3 md:grid-cols-2">
            <div className="field-stack md:col-span-2">
              <label htmlFor="agency-name" className="input-label">
                Nombre comercial
              </label>
              <input
                id="agency-name"
                className="input w-full"
                value={newAgencyName}
                onChange={(event) => setNewAgencyName(event.target.value)}
                placeholder="Agencia Centro"
                minLength={2}
                required
                disabled={!canCreateOrganizations || isCreatingAgency}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="agency-legal-name" className="input-label">
                Razon social
              </label>
              <input
                id="agency-legal-name"
                className="input w-full"
                value={newAgencyLegalName}
                onChange={(event) => setNewAgencyLegalName(event.target.value)}
                placeholder="Agencia Centro SRL"
                disabled={!canCreateOrganizations || isCreatingAgency}
              />
            </div>
            <div className="field-stack">
              <label htmlFor="agency-tax-id" className="input-label">
                CUIT (opcional)
              </label>
              <input
                id="agency-tax-id"
                className="input w-full"
                value={newAgencyTaxId}
                onChange={(event) => setNewAgencyTaxId(event.target.value)}
                placeholder="30712345678"
                disabled={!canCreateOrganizations || isCreatingAgency}
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="btn btn-emerald w-full"
                disabled={!canCreateOrganizations || isCreatingAgency}
              >
                {isCreatingAgency ? "Creando agencia..." : "Crear agencia"}
              </button>
            </div>
          </form>

          {agencyStatus ? (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {agencyStatus}
            </p>
          ) : null}

          {!canCreateOrganizations ? (
            <p className="text-xs text-amber-700">
              Solo los usuarios OWNER pueden crear nuevas agencias.
            </p>
          ) : null}
        </article>
      </div>

      <article className="card space-y-4">
        <div className="flex items-center gap-2">
          <UsersIcon className="size-4 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-900">
            Alta rapida de usuarios por agencia
          </h2>
        </div>
        <p className="section-subtitle">
          Crea usuarios y define el rol inicial en una agencia donde tengas permisos.
        </p>

        <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="field-stack">
            <label htmlFor="user-org" className="input-label">
              Agencia
            </label>
            <select
              id="user-org"
              className="input w-full"
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              disabled={!hasManageableOrgs || isCreatingUser}
            >
              {manageableOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({roleLabel(organization.role)})
                </option>
              ))}
            </select>
          </div>
          <div className="field-stack">
            <label htmlFor="user-email" className="input-label">
              Email
            </label>
            <input
              id="user-email"
              type="email"
              className="input w-full"
              value={newUserEmail}
              onChange={(event) => setNewUserEmail(event.target.value)}
              placeholder="usuario@agencia.com"
              required
              disabled={!hasManageableOrgs || isCreatingUser}
            />
          </div>
          <div className="field-stack">
            <label htmlFor="user-name" className="input-label">
              Nombre
            </label>
            <input
              id="user-name"
              className="input w-full"
              value={newUserName}
              onChange={(event) => setNewUserName(event.target.value)}
              placeholder="Nombre Apellido"
              disabled={!hasManageableOrgs || isCreatingUser}
            />
          </div>
          <div className="field-stack">
            <label htmlFor="user-role" className="input-label">
              Rol
            </label>
            <select
              id="user-role"
              className="input w-full"
              value={newUserRole}
              onChange={(event) =>
                setNewUserRole(event.target.value as (typeof ROLE_OPTIONS)[number])
              }
              disabled={!hasManageableOrgs || isCreatingUser}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-stack md:col-span-2 xl:col-span-4">
            <label htmlFor="user-password" className="input-label">
              Contraseña (requerida si el usuario no existe)
            </label>
            <input
              id="user-password"
              type="password"
              className="input w-full"
              value={newUserPassword}
              onChange={(event) => setNewUserPassword(event.target.value)}
              placeholder="minimo 8 caracteres"
              minLength={8}
              disabled={!hasManageableOrgs || isCreatingUser}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <button
              type="submit"
              className="btn btn-sky w-full"
              disabled={!hasManageableOrgs || isCreatingUser}
            >
              {isCreatingUser ? "Creando usuario..." : "Crear usuario"}
            </button>
          </div>
        </form>

        {userStatus ? (
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {userStatus}
          </p>
        ) : null}

        {!hasManageableOrgs ? (
          <p className="text-xs text-amber-700">
            Necesitas rol OWNER o ADMIN en al menos una agencia para dar de alta usuarios.
          </p>
        ) : null}
      </article>

      <article className="card space-y-4">
        <div className="flex items-center gap-2">
          <UsersIcon className="size-4 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-900">
            Bootstrap usuario developer
          </h2>
        </div>
        <p className="section-subtitle">
          Crea un usuario developer con su empresa propia de testing y datos base.
        </p>

        <form
          onSubmit={handleBootstrapDeveloper}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <div className="field-stack">
            <label htmlFor="developer-email" className="input-label">
              Email developer
            </label>
            <input
              id="developer-email"
              type="email"
              className="input w-full"
              value={developerEmail}
              onChange={(event) => setDeveloperEmail(event.target.value)}
              required
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            />
          </div>

          <div className="field-stack">
            <label htmlFor="developer-name" className="input-label">
              Nombre
            </label>
            <input
              id="developer-name"
              className="input w-full"
              value={developerName}
              onChange={(event) => setDeveloperName(event.target.value)}
              placeholder="Developer"
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            />
          </div>

          <div className="field-stack">
            <label htmlFor="developer-password" className="input-label">
              Contraseña (opcional)
            </label>
            <input
              id="developer-password"
              type="password"
              className="input w-full"
              value={developerPassword}
              onChange={(event) => setDeveloperPassword(event.target.value)}
              placeholder="vacia = autogenerada"
              minLength={8}
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            />
          </div>

          <div className="field-stack">
            <label htmlFor="developer-company-name" className="input-label">
              Empresa testing
            </label>
            <input
              id="developer-company-name"
              className="input w-full"
              value={developerCompanyName}
              onChange={(event) => setDeveloperCompanyName(event.target.value)}
              required
              minLength={2}
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            />
          </div>

          <div className="field-stack">
            <label htmlFor="developer-company-legal-name" className="input-label">
              Razon social (opcional)
            </label>
            <input
              id="developer-company-legal-name"
              className="input w-full"
              value={developerCompanyLegalName}
              onChange={(event) => setDeveloperCompanyLegalName(event.target.value)}
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            />
          </div>

          <div className="field-stack">
            <label htmlFor="developer-company-taxid" className="input-label">
              CUIT (opcional)
            </label>
            <input
              id="developer-company-taxid"
              className="input w-full"
              value={developerCompanyTaxId}
              onChange={(event) => setDeveloperCompanyTaxId(event.target.value)}
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            />
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={grantCurrentAccess}
                onChange={(event) => setGrantCurrentAccess(event.target.checked)}
                disabled={!canCreateOrganizations || isBootstrappingDeveloper}
              />
              Darme acceso OWNER a esa empresa tambien
            </label>
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <button
              type="submit"
              className="btn btn-emerald w-full"
              disabled={!canCreateOrganizations || isBootstrappingDeveloper}
            >
              {isBootstrappingDeveloper
                ? "Creando developer..."
                : "Crear developer + empresa testing"}
            </button>
          </div>
        </form>

        {developerStatus ? (
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {developerStatus}
          </p>
        ) : null}

        {developerTemporaryPassword ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Contraseña autogenerada (guardala ahora):{" "}
            <span className="font-mono">{developerTemporaryPassword}</span>
          </p>
        ) : null}

        {!canCreateOrganizations ? (
          <p className="text-xs text-amber-700">
            Necesitas rol OWNER para usar el bootstrap de developer.
          </p>
        ) : null}
      </article>

      <article className="card space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">
          Agencias disponibles
        </h2>
        <div className="table-scroll">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Agencia</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Usuarios</th>
                <th className="px-3 py-2">Clientes</th>
                <th className="px-3 py-2">Productos</th>
                <th className="px-3 py-2">Ventas</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/70">
              {organizations.map((organization) => {
                const isActive = organization.id === activeOrgId;
                return (
                  <tr key={organization.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-zinc-900">{organization.name}</p>
                      <p className="text-xs text-zinc-500">
                        {organization.legalName || "Sin razon social"}
                        {organization.taxId ? ` · CUIT ${organization.taxId}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {roleLabel(organization.role)}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">{organization.counts.users}</td>
                    <td className="px-3 py-3 text-zinc-700">{organization.counts.customers}</td>
                    <td className="px-3 py-3 text-zinc-700">{organization.counts.products}</td>
                    <td className="px-3 py-3 text-zinc-700">{organization.counts.sales}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-indigo"
                          onClick={() => handleSwitchOrganization(organization.id)}
                          disabled={isActive || switchingOrgId === organization.id}
                        >
                          {isActive
                            ? "Activa"
                            : switchingOrgId === organization.id
                            ? "Cambiando..."
                            : "Activar"}
                        </button>
                        {isActive ? (
                          <Link href="/app/admin" className="btn">
                            Configurar
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
