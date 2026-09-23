"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, ShoppingBag, BarChart3, Users, Zap, Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import { useBusinessName, useSettings } from "@/lib/hooks/use-app-settings"

const FEATURES = [
  { icon: ShoppingBag, text: "Gestión de pedidos en tiempo real" },
  { icon: BarChart3, text: "Análisis de rendimiento y ventas" },
  { icon: Users, text: "Administración de clientes" },
  { icon: Zap, text: "Flujo de trabajo optimizado" },
]

export function LoginForm() {
  const router = useRouter()
  const settings = useSettings()
  const businessName = useBusinessName()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email: fd.get("email") as string,
      password: fd.get("password") as string,
    })

    if (error) {
      setError("Email o contraseña incorrectos")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel izquierdo — marca */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-zinc-950 p-12 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-32 -right-16 w-[400px] h-[400px] rounded-full bg-orange-600/10 blur-[100px] pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10">
          <Image
            src={settings.logo_url ?? "/logo.webp"}
            alt={businessName}
            width={36}
            height={36}
            className="rounded-xl object-cover"
          />
          <span className="text-white font-semibold text-headline tracking-tight">{businessName}</span>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-display text-white">
              Operaciones simples.<br />
              <span className="text-zinc-400">Resultados reales.</span>
            </h1>
            <p className="text-zinc-500 text-callout leading-relaxed max-w-sm">
              Sistema de gestión para tu restaurante. Pedidos, clientes, métricas y más —
              todo en un solo lugar.
            </p>
          </div>

          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-zinc-400 text-subheadline">
                <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-zinc-300" />
                </div>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-zinc-600 text-caption relative z-10">
          © {new Date().getFullYear()} {businessName}
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-zinc-900 p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Image
              src={settings.logo_url ?? "/logo.webp"}
              alt={businessName}
              width={32}
              height={32}
              className="rounded-lg object-cover"
            />
            <span className="text-white font-semibold">{businessName}</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-white text-title1">Bienvenido</h2>
            <p className="text-zinc-500 text-subheadline">Ingresá tus credenciales para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-zinc-300 text-subheadline">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-500 focus-visible:border-zinc-500 h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-zinc-300 text-subheadline">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-500 focus-visible:border-zinc-500 h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-red-400 text-subheadline">{error}</p>}

            <Button
              type="submit"
              className="w-full h-10 bg-white text-zinc-900 hover:bg-zinc-100 font-medium cursor-pointer"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
