import path from "node:path";
import { Document, Font, Image, Link, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

// Modèle de CV une page (titre bleu marine, photo à droite, sections soulignées,
// dates alignées à droite). Il ne contient aucune donnée personnelle : le
// contenu et la photo sont fournis à l'appel. La police est Carlito, version
// libre et de mêmes dimensions que Calibri, pour que les retours à la ligne
// restent ceux d'un CV composé en Calibri.
export interface CvModele {
  nom: string;
  titre: string;
  contact: string[];
  liens: { texte: string; url?: string }[];
  accroche: string;
  titresSections: { competences: string; experiences: string; formation: string; interets: string };
  competences: { label: string; texte: string }[];
  experiences: { titre: string; periode: string; detail?: string; points: string[] }[];
  formations: { titre: string; periode: string }[];
  interets: string;
  // Ponctuation entre l'intitulé d'une compétence et son contenu : « : » en
  // français (espace avant), « : » collé en anglais.
  separateurLabel?: string;
}

const NAVY = "#1F3864";
const BLEU = "#2F5496";
const GRIS = "#595959";
const NOIR = "#111111";

const dossierPolices = path.join(process.cwd(), "node_modules/@fontsource/carlito/files");
Font.register({
  family: "Carlito",
  fonts: [
    { src: path.join(dossierPolices, "carlito-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(dossierPolices, "carlito-latin-700-normal.woff"), fontWeight: 700 },
    { src: path.join(dossierPolices, "carlito-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    { src: path.join(dossierPolices, "carlito-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
  ],
});
// Pas de coupure de mots : un CV ne doit pas couper « Category-\nManagement ».
Font.registerHyphenationCallback((mot) => [mot]);

const styles = StyleSheet.create({
  page: { paddingTop: 29, paddingBottom: 28, paddingHorizontal: 40, fontFamily: "Carlito", fontSize: 10, color: NOIR, lineHeight: 1.3 },
  entete: { flexDirection: "row", justifyContent: "space-between", minHeight: 70 },
  enteteTexte: { flex: 1, paddingRight: 12 },
  nom: { fontSize: 20, fontWeight: 700, color: NAVY, lineHeight: 1.15 },
  titre: { fontSize: 11.5, fontWeight: 700, color: BLEU, marginTop: 3 },
  ligneContact: { color: GRIS, marginTop: 3, fontSize: 10 },
  ligneLiens: { color: GRIS, fontSize: 10 },
  photo: { width: 68, height: 68, objectFit: "cover", marginTop: 3 },
  accroche: { marginTop: 6, textAlign: "justify" },
  titreSection: {
    fontSize: 11,
    fontWeight: 700,
    color: NAVY,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginTop: 12,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: NAVY,
    marginBottom: 6,
  },
  competence: { marginBottom: 2 },
  gras: { fontWeight: 700 },
  experience: { marginBottom: 6.5 },
  ligneTitre: { flexDirection: "row", justifyContent: "space-between" },
  titreExperience: { fontWeight: 700, flex: 1, paddingRight: 10 },
  periode: { color: GRIS },
  detail: { fontStyle: "italic", color: GRIS },
  point: { flexDirection: "row", marginTop: 2 },
  puce: { width: 14, color: NAVY, fontSize: 8, paddingLeft: 3, paddingTop: 1.5 },
  pointTexte: { flex: 1 },
  formation: { marginBottom: 6.5 },
});

// « **texte** » devient du gras.
function Enrichi({ texte }: { texte: string }) {
  return (
    <Text>
      {texte.split(/(\*\*[^*]+\*\*)/g).map((segment, i) =>
        segment.startsWith("**") ? (
          <Text key={i} style={styles.gras}>
            {segment.slice(2, -2)}
          </Text>
        ) : (
          segment
        ),
      )}
    </Text>
  );
}

export async function rendreCv(cv: CvModele, photo?: Buffer): Promise<Buffer> {
  const doc = (
    <Document title={`${cv.nom} - CV`} author={cv.nom}>
      <Page size="A4" style={styles.page}>
        <View style={photo ? styles.entete : [styles.entete, { minHeight: 0 }]}>
          <View style={styles.enteteTexte}>
            <Text style={styles.nom}>{cv.nom}</Text>
            <Text style={styles.titre}>{cv.titre}</Text>
            <Text style={styles.ligneContact}>{cv.contact.join("  ·  ")}</Text>
            <Text style={styles.ligneLiens}>
              {cv.liens.map((lien, i) => (
                <Text key={i}>
                  {i > 0 ? "  ·  " : ""}
                  {lien.url ? (
                    <Link src={lien.url} style={{ color: BLEU, textDecoration: "underline" }}>
                      {lien.texte}
                    </Link>
                  ) : (
                    lien.texte
                  )}
                </Text>
              ))}
            </Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- l'Image de react-pdf n'a pas d'attribut alt */}
          {photo && <Image src={photo} style={styles.photo} />}
        </View>

        <Text style={styles.accroche}>{cv.accroche}</Text>

        <Text style={styles.titreSection}>{cv.titresSections.competences}</Text>
        {cv.competences.map((c) => (
          <Text key={c.label} style={styles.competence}>
            <Text style={styles.gras}>{c.label}{cv.separateurLabel ?? " : "}</Text>
            {c.texte}
          </Text>
        ))}

        <Text style={styles.titreSection}>{cv.titresSections.experiences}</Text>
        {cv.experiences.map((e) => (
          <View key={e.titre} style={styles.experience} wrap={false}>
            <View style={styles.ligneTitre}>
              <Text style={styles.titreExperience}>{e.titre}</Text>
              <Text style={styles.periode}>{e.periode}</Text>
            </View>
            {e.detail && <Text style={styles.detail}>{e.detail}</Text>}
            {e.points.map((p) => (
              <View key={p} style={styles.point}>
                <Text style={styles.puce}>•</Text>
                <Text style={styles.pointTexte}>
                  <Enrichi texte={p} />
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.titreSection}>{cv.titresSections.formation}</Text>
        {cv.formations.map((f) => (
          <View key={f.titre} style={[styles.ligneTitre, styles.formation]}>
            <Text style={styles.titreExperience}>{f.titre}</Text>
            <Text style={styles.periode}>{f.periode}</Text>
          </View>
        ))}

        <Text style={styles.titreSection}>{cv.titresSections.interets}</Text>
        <Text>{cv.interets}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
