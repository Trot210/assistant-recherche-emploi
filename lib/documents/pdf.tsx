import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { CVContent } from "@/lib/anthropic/documents";
import type { Contact, FormationEntry, Activites } from "@/types/database.types";

const BLEU = "#1F4E79";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  nom: { fontSize: 22, color: BLEU, fontWeight: 700, marginBottom: 10 },
  contactRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  contactCol: { flexDirection: "column", maxWidth: "48%" },
  contactLine: { fontSize: 9, marginBottom: 3 },
  bold: { fontWeight: 700 },
  profilText: { fontSize: 10, marginBottom: 16, textAlign: "justify", lineHeight: 1.4 },
  sectionTitle: {
    fontSize: 13,
    color: BLEU,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BLEU,
    paddingBottom: 3,
  },
  expBlock: { marginBottom: 12 },
  expRow: { flexDirection: "row" },
  expDate: { width: 95, fontSize: 9, textDecoration: "underline" },
  expContent: { flex: 1 },
  expTitre: { fontSize: 10.5, fontWeight: 700, marginBottom: 4 },
  sousTitre: { fontSize: 9.5, textDecoration: "underline", marginTop: 5, marginBottom: 2 },
  point: { fontSize: 9.5, marginBottom: 1.5, lineHeight: 1.35 },
  formationRow: { flexDirection: "row", marginBottom: 5 },
  formationDate: { width: 95, fontSize: 9, textDecoration: "underline" },
  formationTitre: { fontSize: 9.5, fontWeight: 700 },
  activiteLine: { fontSize: 9.5, marginBottom: 3 },
});

export async function buildCvPdf(
  cv: CVContent,
  contact: Contact,
  formation: FormationEntry[],
  activites: Activites,
): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {contact.nom && <Text style={styles.nom}>{contact.nom}</Text>}

        <View style={styles.contactRow}>
          <View style={styles.contactCol}>
            {contact.localisation && <Text style={styles.contactLine}>{contact.localisation}</Text>}
            {contact.telephone && <Text style={styles.contactLine}>{contact.telephone}</Text>}
            {contact.email && <Text style={styles.contactLine}>{contact.email}</Text>}
          </View>
          <View style={styles.contactCol}>
            {contact.langues && contact.langues.length > 0 && (
              <Text style={styles.contactLine}>
                <Text style={styles.bold}>Langues : </Text>
                {contact.langues.join(", ")}
              </Text>
            )}
            {contact.outils && contact.outils.length > 0 && (
              <Text style={styles.contactLine}>
                <Text style={styles.bold}>Outils : </Text>
                {contact.outils.join(", ")}
              </Text>
            )}
            {contact.autre && contact.autre.length > 0 && (
              <Text style={styles.contactLine}>
                <Text style={styles.bold}>Autre : </Text>
                {contact.autre.join(", ")}
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.profilText}>{cv.accroche}</Text>

        <Text style={styles.sectionTitle}>Expériences professionnelles</Text>
        {cv.experiences.map((exp, i) => (
          <View key={i} style={styles.expBlock} wrap={false}>
            <View style={styles.expRow}>
              <Text style={styles.expDate}>{exp.periode}</Text>
              <View style={styles.expContent}>
                <Text style={styles.expTitre}>
                  {exp.entreprise}
                  {exp.lieu ? `, ${exp.lieu}` : ""} — {exp.poste}
                </Text>
                {exp.sous_sections.map((ss, j) => (
                  <View key={j}>
                    <Text style={styles.sousTitre}>{ss.titre}</Text>
                    {ss.points.map((p, k) => (
                      <Text key={k} style={styles.point}>
                        {p}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}

        {formation.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Formation</Text>
            {formation.map((f, i) => (
              <View key={i} style={styles.formationRow}>
                <Text style={styles.formationDate}>{f.periode}</Text>
                <Text style={styles.formationTitre}>
                  {f.intitule}
                  {f.etablissement ? `, ${f.etablissement}` : ""}
                </Text>
              </View>
            ))}
          </>
        )}

        {(activites.loisirs || activites.sport) && (
          <>
            <Text style={styles.sectionTitle}>Activités & Centres d&apos;intérêts</Text>
            {activites.loisirs && (
              <Text style={styles.activiteLine}>
                <Text style={styles.bold}>Loisirs : </Text>
                {activites.loisirs}
              </Text>
            )}
            {activites.sport && (
              <Text style={styles.activiteLine}>
                <Text style={styles.bold}>Sport : </Text>
                {activites.sport}
              </Text>
            )}
          </>
        )}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

export async function buildLettrePdf(lettre: string, contact: Contact): Promise<Buffer> {
  const paragraphes = lettre.split(/\n{2,}/).filter((p) => p.trim() !== "");

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {contact.nom && <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: BLEU }}>{contact.nom}</Text>}
        <View style={{ marginBottom: 20 }}>
          {contact.localisation && <Text style={styles.contactLine}>{contact.localisation}</Text>}
          {contact.telephone && <Text style={styles.contactLine}>{contact.telephone}</Text>}
          {contact.email && <Text style={styles.contactLine}>{contact.email}</Text>}
        </View>
        {paragraphes.map((p, i) => (
          <Text key={i} style={{ fontSize: 10.5, marginBottom: 10, lineHeight: 1.5, textAlign: "justify" }}>
            {p.trim()}
          </Text>
        ))}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
