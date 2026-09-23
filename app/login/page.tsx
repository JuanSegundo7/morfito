import { LoginForm } from "@/components/auth/login-form"
import { QueryProvider } from "@/components/providers/query-provider"
import { ThemeColorProvider } from "@/components/providers/theme-color-provider"

// Sin ProjectNameProvider a propósito: esta ruta vive fuera de
// app/(dashboard)/layout.tsx (donde se hace el único fetch de
// getEntitlements()) y no tiene una forma barata de leer project.name sin
// duplicar esa llamada acá. LoginForm resuelve el nombre a mostrar vía
// useBusinessName() (lib/hooks/use-app-settings.ts), que sin
// ProjectNameProvider cae directo a "Morfito" — settings.business_name
// sigue pudiendo pisarlo. Ver components/providers/project-name-provider.tsx.
export default function LoginPage() {
  return (
    <QueryProvider>
      <ThemeColorProvider>
        <LoginForm />
      </ThemeColorProvider>
    </QueryProvider>
  )
}
