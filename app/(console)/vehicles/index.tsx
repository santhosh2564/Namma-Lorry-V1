import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ConsoleModal, DataTable, type Column } from "@/components/console";
import { Banner, Button, EmptyState, TextField } from "@/components/ui";
import { useConsoleSearch } from "@/features/console/searchStore";
import {
  VEHICLE_TYPES,
  addVehicleSchema,
  formatRegistration,
  type VehicleType,
} from "@/features/vehicles/schemas";
import { useCreateVehicle, useVehicles } from "@/features/vehicles/useVehicles";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

/**
 * C9 Vehicles (docs/12, doc 04 §4 C10).
 *
 * Unlike a driver, a vehicle is a plain table, so this screen writes directly
 * under the admin-only RLS policy — no Edge Function and no service role.
 *
 * The registration number is validated against the Indian format here because
 * the column is UNIQUE: a typo would create a second truck that looks identical
 * rather than showing an error (see src/features/vehicles/schemas.ts).
 */
export default function VehiclesScreen() {
  const { t, i18n } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [registrationNo, setRegistrationNo] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("19ft");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const search = useConsoleSearch((state) => state.search);
  const vehiclesQuery = useVehicles();
  const createVehicle = useCreateVehicle();

  const rows = useMemo(() => {
    const all = vehiclesQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (term === "") {
      return all;
    }
    return all.filter(
      (vehicle) =>
        vehicle.registrationNo.toLowerCase().includes(term) ||
        vehicle.vehicleType.toLowerCase().includes(term),
    );
  }, [search, vehiclesQuery.data]);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "registration",
      header: t("console.vehicle.registration"),
      sortValue: (row) => row.registrationNo,
      render: (row) => <Text style={styles.plate}>{row.registrationNo}</Text>,
    },
    {
      key: "type",
      header: t("console.vehicle.type"),
      sortValue: (row) => row.vehicleType,
      render: (row) => <Text style={styles.cell}>{row.vehicleType}</Text>,
    },
    {
      key: "owner",
      header: t("console.vehicle.owner"),
      sortValue: (row) => row.ownerName ?? "",
      // ND-19: the owner picker is hidden until an admin can create owner and
      // shipper profiles, so every row is empty today by design.
      render: (row) => (
        <Text style={row.ownerName ? styles.cell : styles.muted}>
          {row.ownerName ?? t("console.vehicle.noOwner")}
        </Text>
      ),
    },
    {
      key: "added",
      header: t("console.vehicle.added"),
      sortValue: (row) => row.createdAt,
      render: (row) => <Text style={styles.cell}>{formatDate(row.createdAt, i18n.language)}</Text>,
    },
  ];

  const closeModal = () => {
    setModalOpen(false);
    setRegistrationNo("");
    setVehicleType("19ft");
    setFieldError(null);
    setSubmitError(null);
  };

  const onSave = async () => {
    const parsed = addVehicleSchema.safeParse({ registrationNo, vehicleType });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldError(issue ? t(issue.message) : t("console.vehicle.invalidRegistration"));
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    try {
      await createVehicle.mutateAsync(parsed.data);
      closeModal();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("console.vehicle.createFailed"));
    }
  };

  return (
    <View style={styles.screen} testID="vehicles-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>{t("console.vehicle.title")}</Text>
          <Text style={styles.subheading}>{t("console.vehicle.subtitle")}</Text>
        </View>
        <Button
          icon="add"
          label={t("console.vehicle.add")}
          onPress={() => setModalOpen(true)}
          size="lg"
          testID="vehicles-add-open"
        />
      </View>

      {vehiclesQuery.isError ? (
        <Banner message={t("console.vehicle.loadFailed")} variant="error" />
      ) : null}

      {vehiclesQuery.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon="garage"
          message={t("console.vehicle.empty")}
          title={t("console.vehicle.emptyTitle")}
        />
      ) : (
        <DataTable
          columns={columns}
          emptyMessage={t("console.vehicle.empty")}
          pageSize={12}
          rowKey={(row) => row.id}
          rows={rows}
          testID="vehicles-table"
        />
      )}

      <ConsoleModal
        footer={
          <>
            <Button label={t("common.cancel")} onPress={closeModal} size="lg" variant="outline" />
            <Button
              label={t("console.vehicle.save")}
              loading={createVehicle.isPending}
              onPress={() => void onSave()}
              size="lg"
              testID="vehicles-add-save"
            />
          </>
        }
        onClose={closeModal}
        title={t("console.vehicle.addTitle")}
        visible={modalOpen}
      >
        {submitError ? (
          <Banner message={submitError} onDismiss={() => setSubmitError(null)} variant="error" />
        ) : null}

        <TextField
          autoFocus
          errorText={fieldError ?? undefined}
          helperText={t("console.vehicle.registrationHint")}
          label={t("console.vehicle.registration")}
          maxLength={14}
          onChangeText={setRegistrationNo}
          placeholder="TN 23 BK 4521"
          testID="vehicles-add-registration"
          value={formatRegistration(registrationNo)}
        />

        <View style={styles.typeGroup}>
          <Text style={styles.typeLabel}>{t("console.vehicle.type")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.typeRow}>
              {VEHICLE_TYPES.map((type) => {
                const selected = type === vehicleType;
                return (
                  <Pressable
                    key={type}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setVehicleType(type)}
                    style={[styles.typeChip, selected ? styles.typeChipSelected : null]}
                    testID={`vehicles-type-${type}`}
                  >
                    <Text style={[styles.typeText, selected ? styles.typeTextSelected : null]}>
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ConsoleModal>
    </View>
  );
}

/** Shows the registration back in its stored form while it is being typed. */
function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  subheading: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  plate: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.4,
  },
  cell: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textDisabled },
  typeGroup: { gap: spacing.sm },
  typeLabel: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  typeRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  typeChip: {
    minHeight: touch.min,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.chip,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  typeTextSelected: { color: colors.onPrimary },
});
