import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { DataTable, Drawer, type Column } from "@/components/console";
import { Banner, Button, EmptyState, PhoneInput, TextField } from "@/components/ui";
import { useConsoleSearch } from "@/features/console/searchStore";
import { addDriverSchema, normalisePhoneInput } from "@/features/drivers/schemas";
import { useCreateDriver, useDrivers } from "@/features/drivers/useDrivers";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * C8 Drivers (docs/12, doc 04 §4 C9).
 *
 * The table is read-only — verified trips and km come from `driver_stats`,
 * which only the database writes (hard rule 1). Adding a driver is the one
 * write on this screen, and it goes through the `admin-create-driver` Edge
 * Function because `auth.users` cannot be inserted through RLS.
 *
 * ND-19 items are deliberately absent: no permission-health dot and no
 * "send invite SMS" toggle.
 */
export default function DriversScreen() {
  const { t, i18n } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const search = useConsoleSearch((state) => state.search);
  const driversQuery = useDrivers();
  const createDriver = useCreateDriver();

  const rows = useMemo(() => {
    const all = driversQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (term === "") {
      return all;
    }
    return all.filter(
      (driver) =>
        driver.fullName.toLowerCase().includes(term) ||
        driver.phone.replace(/\D/g, "").includes(term),
    );
  }, [driversQuery.data, search]);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: t("console.drivers.name"),
      sortValue: (row) => row.fullName,
      render: (row) => <Text style={styles.cell}>{row.fullName}</Text>,
    },
    {
      key: "phone",
      header: t("console.drivers.phone"),
      sortValue: (row) => row.phone,
      render: (row) => <Text style={styles.cell}>{row.phone || "—"}</Text>,
    },
    {
      key: "trips",
      header: t("console.drivers.verifiedTrips"),
      align: "right",
      sortValue: (row) => row.verifiedTrips,
      render: (row) => <Text style={styles.number}>{row.verifiedTrips}</Text>,
    },
    {
      key: "km",
      header: t("console.drivers.verifiedKm"),
      align: "right",
      sortValue: (row) => row.verifiedKm,
      render: (row) => <Text style={styles.number}>{row.verifiedKm}</Text>,
    },
    {
      key: "lastTrip",
      header: t("console.drivers.lastTrip"),
      sortValue: (row) => row.lastTripAt ?? "",
      render: (row) =>
        row.lastTripAt === null ? (
          <Text style={styles.muted}>{t("console.drivers.noTrips")}</Text>
        ) : (
          <Text style={styles.cell}>{formatDate(row.lastTripAt, i18n.language)}</Text>
        ),
    },
    {
      key: "status",
      header: t("console.drivers.status"),
      sortValue: (row) => (row.isActive ? "active" : "inactive"),
      render: (row) => (
        <Text style={[styles.cell, row.isActive ? styles.active : styles.inactive]}>
          {row.isActive ? t("console.drivers.active") : t("console.drivers.inactive")}
        </Text>
      ),
    },
  ];

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFullName("");
    setPhone("");
    setFieldError(null);
    setSubmitError(null);
  };

  const onSave = async () => {
    const parsed = addDriverSchema.safeParse({
      fullName,
      phone: normalisePhoneInput(phone) ?? phone,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldError(issue ? t(issue.message) : t("console.driver.invalidPhone"));
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    try {
      await createDriver.mutateAsync(parsed.data);
      closeDrawer();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("console.driver.createFailed"));
    }
  };

  return (
    <View style={styles.screen} testID="drivers-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>{t("console.drivers.title")}</Text>
          <Text style={styles.subheading}>{t("console.drivers.subtitle")}</Text>
        </View>
        <Button
          icon="person_add"
          label={t("console.drivers.add")}
          onPress={() => setDrawerOpen(true)}
          size="lg"
          testID="drivers-add-open"
        />
      </View>

      {driversQuery.isError ? (
        <Banner message={t("console.drivers.loadFailed")} variant="error" />
      ) : null}

      {driversQuery.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon="badge"
          message={t("console.drivers.empty")}
          title={t("console.drivers.emptyTitle")}
        />
      ) : (
        <DataTable
          columns={columns}
          emptyMessage={t("console.drivers.empty")}
          pageSize={12}
          rowKey={(row) => row.id}
          rows={rows}
          testID="drivers-table"
        />
      )}

      <Drawer onClose={closeDrawer} title={t("console.drivers.addTitle")} visible={drawerOpen}>
        {submitError ? (
          <Banner message={submitError} onDismiss={() => setSubmitError(null)} variant="error" />
        ) : null}

        <TextField
          autoFocus
          label={t("console.drivers.name")}
          onChangeText={setFullName}
          placeholder={t("console.drivers.namePlaceholder")}
          testID="drivers-add-name"
          value={fullName}
        />

        <PhoneInput
          errorText={fieldError ?? undefined}
          onChangeText={setPhone}
          testID="drivers-add-phone"
          value={phone}
        />

        <Text style={styles.hint}>{t("console.drivers.addHint")}</Text>

        <Button
          fullWidth
          label={t("console.drivers.save")}
          loading={createDriver.isPending}
          onPress={() => void onSave()}
          size="lg"
          testID="drivers-add-save"
        />
      </Drawer>
    </View>
  );
}

/** `2026-09-27` in the console's language, falling back to the raw date. */
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
  cell: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
  number: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textDisabled },
  active: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.verified },
  inactive: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.textDisabled },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});
