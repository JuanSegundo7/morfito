"use client";

import { createContext, useContext, type ReactNode } from "react";

// Mirrors components/providers/vertical-provider.tsx's pattern exactly:
// resolved once server-side in app/(dashboard)/layout.tsx (from the same
// getEntitlements() call that already resolves the vertical), threaded down
// as a plain string prop, exposed to client components via useProjectName().
//
// "Morfito" is the fail-open default for BOTH cases useVertical() already
// documents for burgerVertical: called outside a ProjectNameProvider (no
// provider mounted — e.g. app/login/page.tsx, which lives outside the
// (dashboard) layout and has no entitlements fetch to resolve a real name
// from), or entitlements.status !== "known" (control-panel unreachable/
// misconfigured — see app/(dashboard)/layout.tsx). This is the same literal
// already hardcoded in components/layout/sidebar.tsx and
// components/auth/login-form.tsx today, so an unconfigured/unreachable
// deployment sees zero change from this port.
const ProjectNameContext = createContext<string | null>(null);

interface ProjectNameProviderProps {
  projectName: string;
  children: ReactNode;
}

export function ProjectNameProvider({ projectName, children }: ProjectNameProviderProps) {
  return <ProjectNameContext.Provider value={projectName}>{children}</ProjectNameContext.Provider>;
}

/**
 * Reads the control-panel's name for this deployment. Never throws — falls
 * back to "Morfito" outside a ProjectNameProvider, same fail-open posture as
 * useVertical(). Business display code should almost never call this
 * directly — see lib/hooks/use-app-settings.ts's useBusinessName(), which
 * layers the optional app_settings.business_name override on top of this.
 */
export function useProjectName(): string {
  const projectName = useContext(ProjectNameContext);
  return projectName ?? "Morfito";
}
