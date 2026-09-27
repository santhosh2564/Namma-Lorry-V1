import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { DataTable, Drawer, ConsoleModal, Sidebar, TopBar } from "@/components/console";
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  ListRow,
  OtpInput,
  PhoneInput,
  Screen,
  SectionHeader,
  StatBlock,
  StatusChip,
  TextField,
} from "@/components/ui";
import { tripStatusList } from "@/theme/status";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

type Driver = {
  id: string;
  name: string;
  trips: number;
  km: number;
  status: "verified" | "needs_review";
};

const demoDrivers: Driver[] = [
  { id: "1", name: "Murugan S", trips: 38, km: 14860, status: "verified" },
  { id: "2", name: "Ravi K", trips: 12, km: 4210, status: "needs_review" },
  { id: "3", name: "Anand P", trips: 27, km: 9960, status: "verified" },
];

export default function KitchenSink() {
  const [phone, setPhone] = useState("9876543210");
  const [otp, setOtp] = useState("12345");
  const [note, setNote] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [nav, setNav] = useState("live");
  const [search, setSearch] = useState("");

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.pageTitle}>UI kitchen sink</Text>
        <Text style={styles.pageHint}>M2 · every token and component in one place</Text>

        <Section title="Buttons">
          <View style={styles.wrap}>
            <Button label="Primary" onPress={() => undefined} />
            <Button label="Secondary" onPress={() => undefined} variant="secondary" />
            <Button label="Success" onPress={() => undefined} variant="success" />
            <Button label="Danger" onPress={() => undefined} variant="danger" />
            <Button label="Outline" onPress={() => undefined} variant="outline" />
            <Button label="Text" onPress={() => undefined} variant="text" />
          </View>
          <Button label="Loading" loading fullWidth onPress={() => undefined} />
          <Button label="Disabled" disabled fullWidth onPress={() => undefined} />
          <Button
            icon="local_shipping"
            label="START TRIP"
            size="driver"
            variant="success"
            fullWidth
            onPress={() => undefined}
          />
        </Section>

        <Section title="Status chips (driver / console)">
          {tripStatusList.map((status) => (
            <View key={status.status} style={styles.rowSpread}>
              <StatusChip status={status.status} />
              <StatusChip audience="console" status={status.status} />
            </View>
          ))}
        </Section>

        <Section title="Chips">
          <View style={styles.wrap}>
            <Chip label="NL-2026-000142" tone="accent" icon="package_2" />
            <Chip label="Assigned" tone="primary" />
            <Chip label="Verified" tone="verified" icon="check_circle" />
            <Chip label="Needs review" tone="review" icon="warning" />
            <Chip label="Rejected" tone="rejected" icon="cancel" />
          </View>
        </Section>

        <Section title="Inputs">
          <PhoneInput value={phone} onChangeText={setPhone} />
          <TextField label="Note" onChangeText={setNote} placeholder="Reviewer note" value={note} />
          <TextField
            errorText="This number isn't registered with Namma Lorry."
            label="Error state"
            onChangeText={() => undefined}
            value=""
          />
          <OtpInput invalid onChangeText={setOtp} value={otp} />
        </Section>

        <Section title="Stats">
          <View style={styles.statsRow}>
            <StatBlock label="Trips" size="sm" value="38" />
            <StatBlock label="Verified km" size="sm" value="14,860" />
            <StatBlock caption="approx." label="Distance" size="sm" value="186 km" />
          </View>
        </Section>

        <Section title="Banners">
          <Banner message="Tracking starts when you tap Start." variant="info" />
          <Banner message="Trip verified — added to your experience." variant="success" />
          <Banner
            actionLabel="Open settings"
            message="Background location is required to record trips."
            variant="warning"
          />
          <Banner message="You're offline — points are saved on your phone." variant="offline" />
        </Section>

        <Section title="Card / list rows">
          <Card>
            <Text style={styles.cardTitle}>NL-2026-000142</Text>
            <Text style={styles.cardBody}>Sriperumbudur SIPCOT → Coimbatore Kurichi</Text>
          </Card>
          <Card>
            <ListRow
              icon="local_shipping"
              onPress={() => undefined}
              subtitle="TN 23 BK 4521 · 19 ft container"
              title="Vehicle"
              value="Assigned"
            />
            <ListRow icon="language" onPress={() => undefined} title="Language" value="English" />
          </Card>
          <EmptyState
            action={<Button label="Create load" onPress={() => undefined} />}
            icon="local_shipping"
            message="New loads appear here when they are created."
            title="No trips assigned yet"
          />
        </Section>

        <Section title="Sheets">
          <Button
            fullWidth
            label="Open bottom sheet"
            onPress={() => setSheetOpen(true)}
            variant="outline"
          />
          <Button
            fullWidth
            label="Confirm end trip"
            onPress={() => setConfirmOpen(true)}
            variant="outline"
          />
        </Section>

        <Section title="Console primitives (web)">
          <View style={styles.consoleFrame}>
            <Sidebar
              activeKey={nav}
              items={[
                { key: "live", label: "Live", icon: "sensors" },
                { key: "loads", label: "Loads", icon: "package_2" },
                { key: "trips", label: "Trips", icon: "route" },
                { key: "review", label: "Review", icon: "fact_check", badge: 3 },
                { key: "drivers", label: "Drivers", icon: "group" },
                { key: "vehicles", label: "Vehicles", icon: "local_shipping" },
              ]}
              onSelect={setNav}
            />
            <View style={styles.consoleMain}>
              <TopBar
                onSearchChange={setSearch}
                searchValue={search}
                title="Drivers"
                avatarInitials="MS"
              />
              <View style={styles.consoleBody}>
                <DataTable
                  columns={[
                    {
                      key: "name",
                      header: "Driver",
                      render: (row: Driver) => row.name,
                      sortable: true,
                    },
                    {
                      key: "trips",
                      header: "Trips",
                      render: (row: Driver) => String(row.trips),
                      sortable: true,
                      align: "right",
                      width: 100,
                    },
                    {
                      key: "km",
                      header: "Km",
                      render: (row: Driver) => String(row.km),
                      sortable: true,
                      align: "right",
                      width: 100,
                    },
                    {
                      key: "status",
                      header: "Status",
                      width: 160,
                      render: (row: Driver) => (
                        <StatusChip audience="console" status={row.status} />
                      ),
                    },
                  ]}
                  initialSortKey="trips"
                  pageSize={2}
                  rowKey={(row) => row.id}
                  rows={demoDrivers}
                />
                <View style={styles.wrap}>
                  <Button
                    label="Open drawer"
                    onPress={() => setDrawerOpen(true)}
                    variant="outline"
                  />
                  <Button label="Open modal" onPress={() => setModalOpen(true)} variant="outline" />
                </View>
              </View>
            </View>
          </View>
        </Section>
      </ScrollView>

      <BottomSheet onClose={() => setSheetOpen(false)} title="Trip filters" visible={sheetOpen}>
        <Banner message="Filter chips land with C5 (M11)." variant="info" />
      </BottomSheet>
      <ConfirmSheet
        confirmLabel="End trip"
        destructive
        message="Make sure you have delivered the load."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
        title="End this trip?"
        visible={confirmOpen}
      />
      <Drawer onClose={() => setDrawerOpen(false)} title="Load detail" visible={drawerOpen}>
        <Banner message="Drawer contents arrive with C4 (M7)." variant="info" />
      </Drawer>
      <ConsoleModal onClose={() => setModalOpen(false)} title="Add driver" visible={modalOpen}>
        <TextField label="Name" onChangeText={() => undefined} value="" />
        <TextField label="Mobile" onChangeText={() => undefined} value="" />
      </ConsoleModal>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.md,
    gap: spacing.lg,
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
  },
  pageTitle: { fontFamily: fonts.semibold, fontSize: fontSize.heading, color: colors.text },
  pageHint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  section: { gap: spacing.sm },
  sectionBody: { gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rowSpread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statsRow: { flexDirection: "row", gap: spacing.xl },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  cardBody: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  consoleFrame: { flexDirection: "row", borderRadius: 16, overflow: "hidden", minHeight: 320 },
  consoleMain: { flex: 1, backgroundColor: colors.background },
  consoleBody: { padding: spacing.md, gap: spacing.md },
});
