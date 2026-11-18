/** Relances et demande d'avis : textes par défaut (modifiables dans Paramètres → Relances & avis). */

export const FOLLOWUP_VARS = '{bonjour} {client} {seance} {numero} {montant} {date} {validite} {lien_avis} {signature}';

export const DEFAULT_QUOTE_FOLLOWUP = `{bonjour}

Je me permets de revenir vers vous au sujet du devis {numero} ({montant}) envoyé le {date} pour « {seance} ».

Avez-vous eu le temps d’y réfléchir ? Je reste à votre disposition pour en parler ou l’adapter à vos envies. Il est valable jusqu’au {validite}.

{signature}`;

export const DEFAULT_PAYMENT_FOLLOWUP = `{bonjour}

Petit rappel amical : l’échéance de {montant} prévue le {date} pour « {seance} » (commande {numero}) n’apparaît pas encore comme réglée.

Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message. N’hésitez pas à me contacter pour toute question.

{signature}`;

export const DEFAULT_REVIEW_MAIL = `{bonjour}

J’espère que vous êtes heureux de vos images de « {seance} » ! Votre avis m’est précieux pour progresser. Si vous avez deux minutes, vous pouvez simplement répondre à ce message :

1. Sur 5, êtes-vous satisfait(e) de l’ensemble de la prestation ?
2. Qu’avez-vous le plus apprécié ?
3. Que pourrais-je améliorer ?

Et si vous le souhaitez, un avis sur Google m’aiderait beaucoup à me faire connaître :
{lien_avis}

Merci encore pour votre confiance,

{signature}`;

/** Replaces {variables}; removes the review-link line when no link is configured. */
export function fillMail(template: string, vars: Record<string, string>): string {
  return template
    .split('\n').filter((l) => !(l.includes('{lien_avis}') && !vars.lien_avis)).join('\n')
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\n{3,}/g, '\n\n').trim();
}
