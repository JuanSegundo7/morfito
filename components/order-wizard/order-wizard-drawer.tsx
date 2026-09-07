"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useSpring } from "@/lib/motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useCustomers } from "@/lib/hooks/use-menu";
import { useCustomerAddresses } from "@/lib/hooks/use-customers";
import { useAllCombos } from "@/lib/hooks/use-combos";
import {
  useAvailableAddonProducts,
  useAvailableProducts,
  useBurgerVariantGroups,
} from "@/lib/hooks/use-products";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { EditCustomerModal } from "../orders/edit/edit-customer-modal";
import { useOrderWizard } from "./hooks/use-order-wizard";
import { useMemo, useEffect } from "react";
import { useVertical } from "@/components/providers/vertical-provider";

import {
  CustomerStep,
  CombosStep,
  BurgersStep,
  SushiStep,
  SummaryStep,
} from "./steps/index";
import type { OrderWithItems } from "@/lib/types";
import { SidesStep } from "./steps/side-step";

interface OrderWizardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  orderToEdit?: OrderWithItems | null;
}

// "items" replaces the old "burgers" key: which STEP COMPONENT renders here
// (BurgersStep vs SushiStep) is now orderFlow-driven — see the render block
// below — instead of always being the burger builder.
type WizardStep = "customer" | "combos" | "items" | "sides" | "summary";

const CUSTOMERS_PER_PAGE = 5;

export function OrderWizardDrawer({
  open,
  onOpenChange,
  mode = "create",
  orderToEdit,
}: OrderWizardDrawerProps) {
  const [step, setStep] = useState<WizardStep>("customer");
  // +1 = avanzando, -1 = retrocediendo — decide de que lado entra/sale el
  // paso (§7: el camino de vuelta tiene que espejar al de ida, no ser el
  // mismo slide en la misma direccion sin importar hacia donde se navega).
  const [direction, setDirection] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);

  // First real behavioral use of a VerticalFeatureFlags flag (see
  // lib/verticals/types.ts) — a vertical with hasCombos: false (today:
  // sushi) skips the Combos step entirely, not just hides its nav link
  // (components/layout/sidebar.tsx).
  const vertical = useVertical();
  const { features, orderFlow, labels } = vertical;
  const hasCombos = features.hasCombos;
  // docs/cloning-a-new-vertical.md §4.1's adapter-switching mechanism: the
  // "items" step renders BurgersStep or SushiStep based on orderFlow.
  // "size-crust-selector" (future pizza work) isn't built yet — it falls
  // back to the burger-builder rendering, same as any other unrecognized
  // value, rather than being its own branch.
  const isSushiFlow = orderFlow === "piece-selector";

  const isSubmittingRef = useRef(false);

  // ================= DATA LOADING =================
  const { data: customers } = useCustomers();
  const { data: burgers } = useAvailableProducts();
  const { data: extras } = useAvailableAddonProducts();
  const { data: combos } = useAllCombos();
  // Phase 3: bulk-fetched variant groups (Medallones/Papas) for every
  // available burger, keyed by product id — see useBurgerSelection's price
  // math, which now reads variant_options.price_delta straight off this
  // instead of the meatExtra/friesExtra magic-string lookups below.
  const { data: burgerVariantGroups } = useBurgerVariantGroups(burgers);

  // ================= COMPUTED DATA =================
  // NOTE: meatExtra/friesExtra are STILL used below, but ONLY for combos
  // (wizard.combos / CombosStep) and for display-only recomputation in
  // SummaryStep — both read a single global "Medallón"/"Papas fritas
  // chicas" price regardless of which burger is in a combo slot, which is
  // the pre-existing combos model. Generalizing combos onto per-product
  // variant groups is explicitly out of scope for this phase (tracked
  // separately — combos generalization). The plain burgers-step path (see
  // useBurgerSelection above) no longer reaches into `extras` for a price
  // at all.
  const meatExtra = useMemo(
    () => extras?.find((e) => e.name === "Medallón"),
    [extras],
  );

  const friesExtra = useMemo(
    () => extras?.find((e) => e.name === "Papas fritas chicas"),
    [extras],
  );

  const availableSides = useMemo(
    () =>
      (extras?.filter((e) => e.category === "sides" && e.is_available) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [extras],
  );

  const extrasByCategory = useMemo(() => {
    if (!extras) return {};
    const grouped = extras.reduce(
      (acc, extra) => {
        if (extra.category === "sides") return acc;
        if (!acc[extra.category]) acc[extra.category] = [];
        acc[extra.category].push(extra);
        return acc;
      },
      {} as Record<string, any[]>,
    );
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name)),
    );
    return grouped;
  }, [extras]);

  const wizard = useOrderWizard({
    meatExtra,
    friesExtra,
    mode,
    orderToEdit,
    allBurgers: burgers || [],
    allCombos: combos || [],
    allExtras: extras || [],
    burgerVariantGroups,
    orderFlow,
  });

  // ================= RESET AL ABRIR (solo en create) =================
  useEffect(() => {
    if (open && mode === "create") {
      wizard.resetAll();
      setStep("customer");
      setCustomerPage(1);
    }
  }, [open]);

  // ================= CUSTOMER ADDRESSES =================
  const { data: customerAddresses, isLoading: isLoadingAddresses } =
    useCustomerAddresses(wizard.customer.selectedCustomer?.id);

  const selectedAddressObj = useMemo(() => {
    if (!customerAddresses || !wizard.customer.selectedAddress) return null;
    return customerAddresses.find(
      (addr) => addr.id === wizard.customer.selectedAddress,
    );
  }, [customerAddresses, wizard.customer.selectedAddress]);

  // ================= FILTERED CUSTOMERS =================
  const filteredCustomers = useMemo(() => {
    if (!customers || !wizard.customer.customerSearch) return customers || [];
    const search = wizard.customer.customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.phone?.includes(wizard.customer.customerSearch),
    );
  }, [customers, wizard.customer.customerSearch]);

  useEffect(() => {
    setCustomerPage(1);
  }, [wizard.customer.customerSearch]);

  const customerTotalPages = Math.ceil(
    filteredCustomers.length / CUSTOMERS_PER_PAGE,
  );

  // ================= ITEM COUNTS (para badges) =================
  const totalBurgerItems = wizard.burgers.selectedBurgers.reduce(
    (acc, b) => acc + b.quantity,
    0,
  );
  const totalSushiItems = wizard.sushi.selectedItems.reduce(
    (acc, i) => acc + i.quantity,
    0,
  );
  const totalComboItems = wizard.combos.selectedCombos.length;
  const totalSideItems = wizard.sides.selectedSides.reduce(
    (acc, s) => acc + s.quantity,
    0,
  );
  const totalItems =
    totalBurgerItems + totalSushiItems + totalComboItems + totalSideItems;

  const showTotalBar =
    step === "combos" || step === "items" || step === "sides";

  // ================= HANDLERS =================
  const handleClose = (open: boolean) => {
    if (!open) {
      setStep("customer");
      setCustomerPage(1);
    }
    onOpenChange(open);
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await wizard.handleSubmit();
      handleClose(false);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleEditCustomer = () => {
    wizard.customer.setIsEditingCustomer(true);
  };

  // 🔑 FIX: When toggling to "new customer", clear the previously selected
  // existing customer so the submit doesn't use stale selectedCustomer data.
  const handleToggleNewCustomer = (isNew: boolean) => {
    wizard.customer.setIsNewCustomer(isNew);
    if (isNew) {
      wizard.customer.setSelectedCustomer(null);
      wizard.customer.setSelectedAddress(undefined);
    } else {
      // Switching back to existing: clear new customer form data
      wizard.customer.setNewCustomerData({ name: "", phone: "" });
      wizard.customer.setNewAddressData({ label: "", address: "", notes: "" });
    }
  };

  // ================= STEP DEFINITIONS =================
  // Step label is data-driven off the active vertical's labels
  // (labels.productNoun/productNounPlural — see lib/verticals/types.ts)
  // instead of a hardcoded "Hamburguesas" string, so a non-burger vertical
  // (e.g. sushi's "rolls") gets a correct label automatically. For the
  // burger vertical this renders the exact same "Hamburguesas" text as
  // before (productNounPlural: "hamburguesas", capitalized here).
  const itemsStepLabel =
    labels.productNounPlural.charAt(0).toUpperCase() +
    labels.productNounPlural.slice(1);

  const steps = [
    { key: "customer", label: "Cliente" },
    ...(hasCombos ? [{ key: "combos", label: "Combos" }] : []),
    { key: "items", label: itemsStepLabel },
    { key: "sides", label: "Acomp." },
    { key: "summary", label: "Resumen" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  // ================= NAVIGATION =================
  const goNext = () => {
    setDirection(1);
    if (step === "customer") setStep(hasCombos ? "combos" : "items");
    else if (step === "combos") setStep("items");
    else if (step === "items") setStep("sides");
    else if (step === "sides") setStep("summary");
  };

  const goBack = () => {
    setDirection(-1);
    if (step === "combos") setStep("customer");
    else if (step === "items") setStep(hasCombos ? "combos" : "customer");
    else if (step === "sides") setStep("items");
    else if (step === "summary") setStep("sides");
  };

  // Slide direccional del body del paso — bajo MotionConfig
  // reducedMotion="user" (app/(dashboard)/layout.tsx) el desplazamiento en
  // x se cae solo y queda un cross-fade, que es exactamente el equivalente
  // de reduced motion que pide §14. No hace falta ramificar a mano acá.
  const stepVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 24 : -24, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -24 : 24, opacity: 0 }),
  };
  const stepTransition = useSpring("move");

  // ================= RENDER =================
  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-2xl flex-col p-0 sm:max-w-2xl"
        >
          {/* HEADER */}
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-title3">
              {mode === "edit"
                ? `Editar Pedido #${orderToEdit?.order_number}`
                : "Crear Pedido"}
            </SheetTitle>

            <div className="flex items-center gap-2 pt-2 overflow-x-auto pb-1">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center shrink-0">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-caption font-medium transition-colors",
                      step === s.key
                        ? "bg-primary text-primary-foreground"
                        : currentStepIndex > i
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {currentStepIndex > i ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="ml-1.5 text-caption">{s.label}</span>
                  {i < steps.length - 1 && (
                    <div className="mx-2 h-px w-5 bg-border" />
                  )}
                </div>
              ))}
            </div>
          </SheetHeader>

          {/* CONTENT */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={stepTransition}
                className="p-6"
              >
              {step === "customer" && (
                <CustomerStep
                  customerSearch={wizard.customer.customerSearch}
                  onCustomerSearchChange={wizard.customer.setCustomerSearch}
                  filteredCustomers={filteredCustomers}
                  selectedCustomer={wizard.customer.selectedCustomer}
                  onSelectCustomer={wizard.customer.setSelectedCustomer}
                  isNewCustomer={wizard.customer.isNewCustomer}
                  onToggleNewCustomer={handleToggleNewCustomer}
                  newCustomerData={wizard.customer.newCustomerData}
                  onNewCustomerDataChange={wizard.customer.setNewCustomerData}
                  newAddressData={wizard.customer.newAddressData}
                  onNewAddressDataChange={wizard.customer.setNewAddressData}
                  selectedAddress={wizard.customer.selectedAddress}
                  onSelectAddress={wizard.customer.setSelectedAddress}
                  isLoadingAddresses={isLoadingAddresses}
                  onEditCustomer={handleEditCustomer}
                  mode={mode}
                  page={customerPage}
                  totalPages={customerTotalPages}
                />
              )}

              {step === "combos" && (
                <CombosStep
                  availableCombos={combos || []}
                  onAddCombo={wizard.combos.addCombo}
                  onRemoveCombo={wizard.combos.removeCombo}
                  selectedCombos={wizard.combos.selectedCombos}
                  availableBurgers={burgers || []}
                  getRemainingQuantity={wizard.combos.getRemainingQuantity}
                  canAddBurgerToSlot={wizard.combos.canAddBurgerToSlot}
                  onAddBurgerToSlot={wizard.combos.addBurgerToSlot}
                  onRemoveBurgerFromSlot={wizard.combos.removeBurgerFromSlot}
                  onIncreaseBurgerQty={wizard.combos.increaseBurgerQty}
                  onDecreaseBurgerQty={wizard.combos.decreaseBurgerQty}
                  onUpdateBurgerMeat={wizard.combos.updateBurgerMeat}
                  onUpdateBurgerFries={wizard.combos.updateComboBurgerFries}
                  onToggleBurgerVeggie={wizard.combos.toggleComboBurgerVeggie}
                  onSelectExtraForSlot={wizard.combos.selectExtraForSlot}
                  onRemoveExtraFromSlot={wizard.combos.removeOneExtraFromSlot}
                  onToggleBurgerIngredient={
                    wizard.combos.toggleComboBurgerIngredient
                  }
                  onToggleBurgerExtra={wizard.combos.toggleComboBurgerExtra}
                  onUpdateBurgerExtraQty={
                    wizard.combos.updateComboBurgerExtraQty
                  }
                  expandedBurgerId={wizard.combos.expandedBurgerId}
                  onToggleBurgerExpanded={wizard.combos.toggleBurgerExpanded}
                  meatExtra={meatExtra}
                  friesExtra={friesExtra}
                  extrasByCategory={extrasByCategory}
                  availableSides={availableSides}
                />
              )}

              {step === "items" &&
                (isSushiFlow ? (
                  <SushiStep
                    availableProducts={burgers || []}
                    selectedItems={wizard.sushi.selectedItems}
                    onAddItem={wizard.sushi.addItem}
                    onRemoveItem={wizard.sushi.removeItem}
                    onUpdateQuantity={wizard.sushi.updateQuantity}
                    onSelectionChange={wizard.sushi.updateSelection}
                  />
                ) : (
                  <BurgersStep
                    availableBurgers={burgers || []}
                    onAddBurger={wizard.burgers.addBurger}
                    selectedBurgers={wizard.burgers.selectedBurgers}
                    onRemoveBurger={wizard.burgers.removeBurger}
                    onUpdateQuantity={wizard.burgers.updateQuantity}
                    onToggleIngredient={wizard.burgers.toggleIngredient}
                    onUpdateMeatCount={wizard.burgers.updateMeatCount}
                    onUpdateFriesQuantity={wizard.burgers.updateFriesQuantity}
                    onToggleVeggie={wizard.burgers.toggleVeggie}
                    onToggleExtra={wizard.burgers.toggleExtra}
                    onUpdateExtraQuantity={wizard.burgers.updateExtraQuantity}
                    expandedBurger={wizard.burgers.expandedBurger}
                    onToggleExpanded={wizard.burgers.toggleExpanded}
                    meatExtra={meatExtra}
                    friesExtra={friesExtra}
                    extrasByCategory={extrasByCategory}
                  />
                ))}

              {step === "sides" && (
                <SidesStep
                  availableSides={availableSides}
                  selectedSides={wizard.sides.selectedSides}
                  extrasByCategory={extrasByCategory}
                  onAddSide={wizard.sides.addSide}
                  onRemoveSide={wizard.sides.removeSide}
                  onUpdateQuantity={wizard.sides.updateQuantity}
                  onToggleExpanded={wizard.sides.toggleExpanded}
                  onToggleExtra={wizard.sides.toggleExtra}
                  onUpdateExtraQuantity={wizard.sides.updateExtraQuantity}
                />
              )}

              {step === "summary" && (
                <SummaryStep
                  isNewCustomer={wizard.customer.isNewCustomer}
                  customerName={
                    wizard.customer.selectedCustomer?.name ??
                    wizard.customer.newCustomerData.name
                  }
                  customerPhone={
                    wizard.customer.selectedCustomer?.phone ??
                    wizard.customer.newCustomerData.phone
                  }
                  selectedAddress={selectedAddressObj}
                  newAddressData={wizard.customer.newAddressData}
                  selectedBurgers={wizard.burgers.selectedBurgers}
                  selectedSushiItems={wizard.sushi.selectedItems}
                  selectedCombos={wizard.combos.selectedCombos}
                  selectedSides={wizard.sides.selectedSides}
                  subtotal={wizard.subtotal}
                  extrasTotal={wizard.extrasTotal}
                  orderTotal={wizard.orderTotal}
                  meatExtra={meatExtra}
                  friesExtra={friesExtra}
                  discountType={wizard.settings.discountType}
                  discountValue={wizard.settings.discountValue}
                  discountAmount={wizard.discountAmount}
                  onDiscountTypeChange={wizard.settings.setDiscountType}
                  onDiscountValueChange={wizard.settings.setDiscountValue}
                  deliveryType={wizard.settings.deliveryType}
                  onDeliveryTypeChange={wizard.settings.setDeliveryType}
                  deliveryFee={wizard.settings.deliveryFee}
                  onDeliveryFeeChange={wizard.settings.setDeliveryFee}
                  paymentMethod={wizard.settings.paymentMethod}
                  onPaymentMethodChange={wizard.settings.setPaymentMethod}
                  notes={wizard.settings.notes}
                  onNotesChange={wizard.settings.setNotes}
                  deliveryTime={wizard.settings.deliveryTime}
                  onDeliveryTimeChange={wizard.settings.setDeliveryTime}
                  source={wizard.settings.source}
                  onSourceChange={wizard.settings.setSource}
                  commissionAmount={wizard.commissionAmount}
                  priceAdjustment={wizard.settings.priceAdjustment}
                  onPriceAdjustmentChange={wizard.settings.setPriceAdjustment}
                />
              )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* TOTAL BAR */}
          {showTotalBar && (
            <div className="shrink-0 border-t bg-muted/40 px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-subheadline text-muted-foreground">
                  <span>Subtotal</span>
                  {totalItems > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption2 font-semibold text-primary-foreground">
                      {totalItems}
                    </span>
                  )}
                </div>
                <span className="text-callout font-semibold text-foreground">
                  {formatCurrency(wizard.subtotal)}
                </span>
              </div>
              {totalItems > 0 && (
                <div className="mt-0.5 flex gap-3 text-caption text-muted-foreground">
                  {totalComboItems > 0 && (
                    <span>
                      {totalComboItems} combo{totalComboItems > 1 ? "s" : ""}
                    </span>
                  )}
                  {(totalBurgerItems > 0 || totalSushiItems > 0) && (
                    <span>
                      {totalBurgerItems + totalSushiItems}{" "}
                      {totalBurgerItems + totalSushiItems > 1
                        ? labels.productNounPlural
                        : labels.productNoun}
                    </span>
                  )}
                  {totalSideItems > 0 && <span>{totalSideItems} acomp.</span>}
                </div>
              )}
            </div>
          )}

          {/* FOOTER */}
          <div className="shrink-0 flex items-center justify-between border-t px-6 py-4 z-10 bg-background">
            {step !== "customer" ? (
              <Button variant="outline" onClick={goBack} className="bg-card">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Atrás
              </Button>
            ) : (
              <div />
            )}

            {step === "customer" &&
              !wizard.customer.isNewCustomer &&
              customerTotalPages > 1 && (
                <div className="ios-glass rounded-full px-4 py-2 flex items-center gap-2 bg-card">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={customerPage === 1}
                    onClick={() => setCustomerPage((p) => p - 1)}
                  >
                    ←
                  </Button>
                  <span className="text-subheadline font-medium">
                    {customerPage} / {customerTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={customerPage === customerTotalPages}
                    onClick={() => setCustomerPage((p) => p + 1)}
                  >
                    →
                  </Button>
                </div>
              )}

            {step === "customer" && (
              <Button
                onClick={goNext}
                disabled={!wizard.canProceedFromCustomer}
              >
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "combos" && (
              <Button onClick={goNext} disabled={!wizard.canProceedFromCombos}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "items" && (
              <Button onClick={goNext}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "sides" && (
              <Button onClick={goNext} disabled={!wizard.canProceedFromSides}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "summary" && (
              <Button
                onClick={handleSubmit}
                disabled={!wizard.settings.deliveryType || wizard.isSubmitting}
              >
                {wizard.isSubmitting
                  ? mode === "edit"
                    ? "Guardando..."
                    : "Creando..."
                  : mode === "edit"
                    ? "Guardar cambios"
                    : "Crear pedido"}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {wizard.customer.selectedCustomer && (
        <EditCustomerModal
          open={wizard.customer.isEditingCustomer}
          onOpenChange={wizard.customer.setIsEditingCustomer}
          customer={wizard.customer.selectedCustomer}
          onSelectAddress={wizard.customer.setSelectedAddress}
          currentAddressId={wizard.customer.selectedAddress}
        />
      )}
    </>
  );
}
