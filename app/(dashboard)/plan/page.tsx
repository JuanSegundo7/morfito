import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { getEntitlements } from "@/lib/entitlements";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BILLING_STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  past_due: "Pago pendiente",
  suspended: "Suspendido",
  canceled: "Cancelado",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  failed: "Vencido",
};

const PAYMENT_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "default",
  pending: "secondary",
  failed: "destructive",
};

export default async function PlanPage() {
  const entitlements = await getEntitlements();

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header title="Mi Plan" subtitle="Estado de tu suscripción y servicios habilitados" />

      <div className="flex-1 overflow-auto py-6 space-y-6">
        {entitlements.status === "unknown" ? (
          <Card className="bg-card">
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No se pudo cargar la información del plan en este momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                  <span className="font-medium">Plan actual</span>
                  <span className="font-bold text-primary">
                    {entitlements.data.plan?.name ?? "Sin plan"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                  <span className="font-medium">Estado de facturación</span>
                  <Badge variant={entitlements.data.billing?.status === "active" ? "default" : "destructive"}>
                    {entitlements.data.billing
                      ? BILLING_STATUS_LABELS[entitlements.data.billing.status] ??
                        entitlements.data.billing.status
                      : "Sin suscripción"}
                  </Badge>
                </div>

                {entitlements.data.billing?.current_period_end && (
                  <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                    <span className="font-medium">Próxima renovación</span>
                    <span className="text-muted-foreground">
                      {formatDate(entitlements.data.billing.current_period_end)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Servicios</CardTitle>
              </CardHeader>
              <CardContent>
                {entitlements.data.services.length > 0 ? (
                  <div className="space-y-2">
                    {entitlements.data.services.map((service) => (
                      <div
                        key={service.key}
                        className="flex items-center justify-between rounded-lg bg-secondary/30 p-3"
                      >
                        <span className="font-medium">{service.name}</span>
                        {service.active ? (
                          <span className="flex items-center gap-1 text-status-ready">
                            <Check className="h-4 w-4" />
                            <span className="text-sm">Activo</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <X className="h-4 w-4" />
                            <span className="text-sm">Inactivo</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    No hay servicios asociados a esta cuenta
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Vencimientos</CardTitle>
              </CardHeader>
              <CardContent>
                {entitlements.data.payments.length > 0 ? (
                  <div className="space-y-2">
                    {entitlements.data.payments.map((payment, index) => {
                      const isNextPending =
                        payment.status === "pending" &&
                        index ===
                          entitlements.data.payments.findIndex((p) => p.status === "pending");

                      return (
                        <div
                          key={`${payment.due_date}-${index}`}
                          className={cn(
                            "flex items-center justify-between rounded-lg p-3",
                            isNextPending
                              ? "bg-primary/10 ring-1 ring-primary/40"
                              : "bg-secondary/30"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{formatCurrency(payment.amount)}</span>
                            <span className="text-xs text-muted-foreground">
                              Vence el {formatDate(payment.due_date)}
                            </span>
                          </div>
                          <Badge variant={PAYMENT_STATUS_VARIANTS[payment.status] ?? "outline"}>
                            {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    No hay vencimientos registrados
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
