import { Stack } from "expo-router";
import React, { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";

import { usePushedPageOptions } from "@/components/navigation/stackOptions";
import { GroupFooter, ListGroup, Row } from "@/components/ui/GroupedList";
import { usePagePalette } from "@/components/ui/pagePalette";
import { PREDEFINED_USER_INTERESTS } from "@/constants/userInterests";
import { useUser } from "@/context/UserContext";
import { LocalUserStorage } from "@/services/localUserStorage";

const PREDEFINED: readonly string[] = PREDEFINED_USER_INTERESTS;

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * İlgi alanları: a checklist saved on every tap, as a Settings list is, so
 * there is no "Kaydet" and nothing to lose on the way back.
 */
export default function InterestsScreen() {
  const palette = usePagePalette();
  const options = usePushedPageOptions("İlgi alanları");
  const { user, setUser } = useUser();

  const [selected, setSelected] = useState<string[]>(() => user?.interests ?? []);
  // Interests outside the fixed list (added by voice during a drive) stay
  // listed while the page is open, so one unticked by mistake can come back.
  const [extras] = useState(() =>
    (user?.interests ?? []).filter((interest) => !PREDEFINED.includes(interest)),
  );

  // Taps can outpace the database. Writes run one after another, each
  // writing the latest full list, and a failed one returns to the last list
  // that was saved.
  const latest = useRef(selected);
  const saved = useRef(selected);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const toggle = (interest: string) => {
    if (!user) return;
    const current = latest.current;
    const next = current.includes(interest)
      ? current.filter((item) => item !== interest)
      : [...current, interest];
    latest.current = next;
    setSelected(next);

    const profile = user;
    queue.current = queue.current.then(async () => {
      const list = latest.current;
      if (sameList(list, saved.current)) return;
      try {
        const updated = await LocalUserStorage.updateUser(profile.id, {
          firstName: profile.first_name,
          lastName: profile.last_name,
          phoneCode: profile.phone_code,
          interests: list,
        });
        saved.current = list;
        if (updated) setUser(updated);
      } catch (error) {
        console.warn(error);
        latest.current = saved.current;
        setSelected(saved.current);
        Alert.alert("İlgi alanları kaydedilemedi", "Lütfen tekrar deneyin.");
      }
    });
  };

  if (!user) return null;

  return (
    <>
      <Stack.Screen options={options} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.content}
      >
        <ListGroup palette={palette} separatorInset={16} style={styles.group}>
          {[...PREDEFINED, ...extras].map((interest) => {
            const isSelected = selected.includes(interest);
            return (
              <Row
                key={interest}
                palette={palette}
                title={interest}
                accessory={isSelected ? "check" : "none"}
                accessibilityState={{ selected: isSelected }}
                onPress={() => toggle(interest)}
              />
            );
          })}
        </ListGroup>
        <GroupFooter
          palette={palette}
          text="AKBA, şarj duraklarında mola yeri önerirken seçtiğiniz ilgi alanlarını kullanır. Sürüş sırasında AKBA'ya söyleyerek ilgi alanı çıkarabilir ya da geri ekleyebilirsiniz."
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  group: {
    marginTop: 16,
  },
});
