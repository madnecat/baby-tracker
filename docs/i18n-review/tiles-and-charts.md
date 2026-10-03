# French review: tiles, charts, profile, API tokens

| English | French chosen | Why unsure |
|---|---|---|
| Feeding (tile label) | Repas | Glossary says Feeding (generic) = Repas; the tile opens breastfeeding or bottle. |
| Breastfeeding — Stop | Allaitement — Arrêter | "Tétée" vs "Allaitement" for the running tile; glossary uses Allaitement for the activity. |
| Last feed: {sides} · {ago} — suggested next: {side} | Dernière tétée : … — côté suggéré ensuite : {side} | Wording of the suggestion; alternating-side advice is health-adjacent. |
| {label} · suggested | {label} · suggéré | Short badge; could be "conseillé". |
| Start {label} / Start breastfeeding / Start contraction | Démarrer : {label} / Démarrer la tétée / Démarrer la contraction | Generic fallback uses a colon because the label prop has no article. |
| Both ({side} first) | Les deux ({side} en premier) | Fine, but check the tile width. |
| Not sure — skip | Pas sûr — passer | Gender-neutral wording avoided "sûr(e)" only partly: "Pas sûr" is the masculine/neutral default. Alternative "Je ne sais pas — passer". |
| Intensity (optional) | Intensité (facultatif) | OK; "facultative" would agree with "intensité" strictly. |
| mild / moderate / strong (contraction intensity) | légère / modérée / forte | Medical-ish; feminine because "contraction". |
| unspecified | non précisée | |
| every ~{duration} / ~{duration} each | toutes les ~{duration} / ~{duration} chacune | Check "toutes les ~2 min" reads naturally. |
| Last {range} — {summary} | Dernières {range} — {summary} | Range is "2 h" so it reads "Dernières 2 h"; "Sur les 2 dernières heures" would need a different range label. |
| No contractions in the last {range}. | Aucune contraction sur les dernières {range}. | Same as above. |
| Like a contraction monitor trace: … | Comme un tracé de monitoring des contractions : … | Medical term (monitoring / tocographie). |
| Age (months) / {v} mo / Your baby | Âge (mois) / {v} mois / Votre bébé | |
| Seemed full afterwards | Satiété apparente ensuite | Gender-neutral. Matches feed.after.satisfied. |
| typically {duration} | généralement {duration} | |
| {satisfied} of {answered} | {satisfied} sur {answered} | |
| From your own notes … talk to your midwife or health visitor … | D'après vos propres remarques … parlez-en à votre sage-femme, à votre médecin ou à la PMI … | Medical/safety note; PMI is France-specific. Owner should confirm the referrals. |
| Baby profile / Name | Profil de bébé / Prénom | "Prénom" chosen for the baby's first name; the field is free text (could be "Nom"). |
| Girl / Boy | Fille / Garçon | |
| Ask how a breastfeed went after I stop it | Me demander comment s'est passée la tétée après l'avoir arrêtée | |
| Feeding settings hint quoting "efficient feed", "seemed full" | « tétée efficace », « satiété apparente » | Must match feed.tag.efficient / feed.after.satisfied (which are capitalised there). |
| AI assistant access | Accès assistant IA | |
| Example prompt: "log a 15 minute breastfeed on the left side from 3pm" | « enregistre une tétée de 15 minutes au sein gauche à partir de 15 h » | The user types this to Claude; French wording is a plausible example. |
| In Claude: Settings → Connectors → Add custom connector | Dans Claude : Paramètres → Connecteurs → Ajouter un connecteur personnalisé | Guess at Claude's own French UI labels; verify against the real app. |
| … (with a space, no line break) | … (avec une espace, sans saut de ligne) | "une espace" (typographic feminine noun) may read oddly; "un espace" is common. |
| Label, e.g. Wife's Claude | Nom, par ex. le Claude de Papa | Example placeholder; Papa chosen to be neutral-ish. |
| Created {d} · last used {d} / never used | Créé {d} · dernière utilisation {d} / jamais utilisé | "Créé" is masculine (le jeton). |
| Revoke | Révoquer | |
