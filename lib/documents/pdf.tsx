import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { CVContent } from "@/lib/anthropic/documents";
import type { Contact, FormationEntry, Activites } from "@/types/database.types";

const NOIR = "#1a1a1a";
const GRIS = "#4a4a4a";
const NAVY = "#1f3a5f";

const styles = StyleSheet.create({
  page: { paddingHorizontal: 38, paddingVertical: 34, fontSize: 9.5, fontFamily: "Helvetica", color: NOIR },

  nom: { fontSize: 19, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, textAlign: "center", color: NAVY },
  contactLine: { fontSize: 9, color: GRIS, textAlign: "center", marginBottom: 10 },
  headerRule: { borderBottomWidth: 1, borderBottomColor: NOIR, marginBottom: 10 },

  ligneCompacte: { fontSize: 8.8, marginBottom: 10, lineHeight: 1.35 },
  ligneLabel: { fontWeight: 700 },

  profilText: { fontSize: 9.5, marginBottom: 12, textAlign: "justify", lineHeight: 1.4 },

  sectionTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: NAVY,
    marginTop: 6,
    marginBottom: 7,
    borderBottomWidth: 0.75,
    borderBottomColor: NAVY,
    paddingBottom: 3,
  },

  expBlock: { marginBottom: 9 },
  expHeaderRow: { flexDirection: "row", marginBottom: 2 },
  expPeriode: { fontSize: 8.3, color: GRIS, textDecoration: "underline", width: 78 },
  expEntrepriseTitre: { fontSize: 9.6, fontWeight: 700, flex: 1 },
  sousSectionBlock: { marginTop: 3 },
  sousSectionTitre: { fontSize: 8.8, fontWeight: 700, textDecoration: "underline", marginBottom: 1.5 },
  point: { fontSize: 8.8, marginBottom: 1.6, lineHeight: 1.3, paddingLeft: 4 },

  formationRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  formationTitre: { fontSize: 9.2, fontWeight: 700 },
  formationEtab: { fontSize: 8.8, color: GRIS },
  formationDate: { fontSize: 8.7, color: GRIS },
});

export async function buildCvPdf(
  cv: CVContent,
  contact: Contact,
  formation: FormationEntry[],
  activites: Activites,
): Promise<Buffer> {
  const contactParts = [contact.localisation, contact.telephone, contact.email].filter(Boolean);
  const activitesParts = [
    activites.loisirs ? `Loisirs : ${activites.loisirs}` : null,
    activites.sport ? `Sport : ${activites.sport}` : null,
  ].filter(Boolean);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {contact.nom && <Text style={styles.nom}>{contact.nom.toUpperCase()}</Text>}
        {contactParts.length > 0 && (
          <Text style={styles.contactLine}>{contactParts.join("   •   ")}</Text>
        )}
        <View style={styles.headerRule} />

        {(contact.langues?.length || contact.outils?.length || contact.autre?.length) ? (
          <Text style={styles.ligneCompacte}>
            {contact.langues && contact.langues.length > 0 && (
              <>
                <Text style={styles.ligneLabel}>Langues : </Text>
                {contact.langues.join(", ")}
                {"   "}
              </>
            )}
            {contact.outils && contact.outils.length > 0 && (
              <>
                <Text style={styles.ligneLabel}>Outils : </Text>
                {contact.outils.join(", ")}
                {"   "}
              </>
            )}
            {contact.autre && contact.autre.length > 0 && (
              <>
                <Text style={styles.ligneLabel}>Autre : </Text>
                {contact.autre.join(", ")}
              </>
            )}
          </Text>
        ) : null}

        <Text style={styles.profilText}>{cv.accroche}</Text>

        {cv.competences_mises_en_avant.length > 0 && (
          <Text style={styles.ligneCompacte}>
            <Text style={styles.ligneLabel}>Compétences clés : </Text>
            {cv.competences_mises_en_avant.join(" • ")}
          </Text>
        )}

        <Text style={styles.sectionTitle}>Expérience professionnelle</Text>
        {cv.experiences.map((exp, i) => (
          <View key={i} style={styles.expBlock} wrap={false}>
            <View style={styles.expHeaderRow}>
              <Text style={styles.expPeriode}>{exp.periode}</Text>
              <Text style={styles.expEntrepriseTitre}>
                {exp.entreprise}
                {exp.lieu ? `, ${exp.lieu}` : ""} – {exp.poste}
              </Text>
            </View>
            {exp.sousSections.map((sousSection, j) => (
              <View key={j} style={styles.sousSectionBlock}>
                <Text style={styles.sousSectionTitre}>{sousSection.titre}</Text>
                {sousSection.points.map((p, k) => (
                  <Text key={k} style={styles.point}>
                    {p}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}

        {formation.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Formation</Text>
            {formation.map((f, i) => (
              <View key={i} style={styles.formationRow}>
                <Text style={styles.formationTitre}>
                  {f.intitule}
                  {f.etablissement && <Text style={styles.formationEtab}>, {f.etablissement}</Text>}
                </Text>
                <Text style={styles.formationDate}>{f.periode}</Text>
              </View>
            ))}
          </>
        )}

        {activitesParts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Activités &amp; centres d&apos;intérêts</Text>
            <Text style={styles.ligneCompacte}>{activitesParts.join("   •   ")}</Text>
          </>
        )}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

export async function buildLettrePdf(lettre: string, contact: Contact): Promise<Buffer> {
  const contactParts = [contact.localisation, contact.telephone, contact.email].filter(Boolean);
  const paragraphes = lettre.split(/\n{2,}/).filter((p) => p.trim() !== "");

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {contact.nom && <Text style={styles.nom}>{contact.nom.toUpperCase()}</Text>}
        {contactParts.length > 0 && (
          <Text style={styles.contactLine}>{contactParts.join("   •   ")}</Text>
        )}
        <View style={{ ...styles.headerRule, marginBottom: 16 }} />
        {paragraphes.map((p, i) => (
          <Text
            key={i}
            style={{ fontSize: 10, marginBottom: 11, lineHeight: 1.45, textAlign: "justify" }}
          >
            {p.trim()}
          </Text>
        ))}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
