import type { Lang } from "../../i18n";
import type { LegalDoc } from "./types";

/** Privacy policy. Keep the facts in sync with what the app does (CLAUDE.md "Accounts", "Billing"). */
export const PRIVACY: Record<Lang, LegalDoc> = {
  en: {
    title: "Privacy policy",
    intro:
      "Twapza (www.twapza.io) turns your long videos into short clips. This policy explains which personal data we use, why, and what your rights are. Twapza is run from the Netherlands and follows the EU General Data Protection Regulation (GDPR). Questions? Email twapza@gmail.com.",
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "Account: your email address, your password (stored only as a secure hash, never readable), your language and your plan.",
          "Your videos: files you upload or YouTube links you import, and everything we make from them (preview, audio, transcript, clips, texts and descriptions).",
          "Usage: how many video minutes you processed each month, so we can apply your plan's limits.",
          "Payments: Creem handles payments. We never see or store your card details; we only receive your subscription status and a Creem customer ID.",
          "Technical data: your IP address and browser requests, used briefly for security and to stop abuse (for example too many login attempts).",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Videos and everything made from them are deleted automatically 24 hours after you add them, or straight away when you delete the project. Your original file is never changed.",
          "Your account and usage records stay until you delete your account (Account page → Delete account). Payment records are kept by Creem as long as tax law requires.",
        ],
      },
      {
        heading: "Why we use it",
        paragraphs: [
          "To provide Twapza to you (our agreement with you): processing your videos, your account, your plan and payments.",
          "To keep Twapza safe and working (our legitimate interest): security, preventing abuse, fixing problems.",
          "To meet legal obligations, such as keeping payment records.",
          "We only email you about your account (for example a password reset). We don't send marketing emails without your permission, and we never sell your data.",
        ],
      },
      {
        heading: "Who helps us",
        paragraphs: [
          "Hetzner Online (Germany) hosts our servers and stores your data. Transcription runs on our own server.",
          "Anthropic (Claude AI, United States) receives the text of your video's transcript to find the best moments and write titles and descriptions. Your video file itself is not sent. Anthropic does not use this data to train its models.",
          "Creem handles payments and, as merchant of record, taxes. Its own privacy policy applies to your payment.",
          "An email service sends account emails such as password resets.",
          "When something goes wrong, technical details about the error (never your videos or account details) can be sent to an error-tracking service so we can fix it.",
          "When these services process data outside the EU, this happens under appropriate safeguards such as the EU Standard Contractual Clauses.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "We use one cookie that keeps you logged in, and your browser's storage to remember your language and download settings. These are necessary for Twapza to work. We don't use analytics, advertising or tracking cookies.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can ask to see, correct, delete or receive a copy of your data, and object to or limit how we use it. You can delete your account and all your data yourself on the Account page. For anything else, email twapza@gmail.com; we answer within one month.",
          "You can also complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens) or the authority in your country.",
        ],
      },
      {
        heading: "Children",
        paragraphs: ["Twapza is not meant for anyone under 16."],
      },
      {
        heading: "Changes",
        paragraphs: [
          "If we change this policy, we update the date on this page. For important changes we'll let you know by email or in the app.",
        ],
      },
    ],
  },

  nl: {
    title: "Privacybeleid",
    intro:
      "Twapza (www.twapza.io) maakt van je lange video's korte clips. In dit beleid lees je welke persoonsgegevens we gebruiken, waarom, en wat je rechten zijn. Twapza wordt gerund vanuit Nederland en volgt de Algemene Verordening Gegevensbescherming (AVG). Vragen? Mail naar twapza@gmail.com.",
    sections: [
      {
        heading: "Wat we verzamelen",
        paragraphs: [
          "Account: je e-mailadres, je wachtwoord (alleen opgeslagen als veilige hash, nooit leesbaar), je taal en je abonnement.",
          "Je video's: bestanden die je uploadt of YouTube-links die je importeert, en alles wat we ervan maken (preview, audio, transcript, clips, teksten en beschrijvingen).",
          "Gebruik: hoeveel videominuten je per maand verwerkt, zodat we de limieten van je abonnement kunnen toepassen.",
          "Betalingen: Creem verwerkt de betalingen. Wij zien of bewaren je kaartgegevens nooit; we ontvangen alleen de status van je abonnement en een Creem-klantnummer.",
          "Technische gegevens: je IP-adres en browserverzoeken, kort gebruikt voor beveiliging en om misbruik te stoppen (bijvoorbeeld te veel inlogpogingen).",
        ],
      },
      {
        heading: "Hoe lang we het bewaren",
        paragraphs: [
          "Video's en alles wat ervan gemaakt is, worden 24 uur nadat je ze toevoegt automatisch verwijderd, of meteen wanneer je het project verwijdert. Je originele bestand wordt nooit aangepast.",
          "Je account en gebruiksgegevens blijven bewaard tot je je account verwijdert (Accountpagina → Account verwijderen). Betaalgegevens bewaart Creem zo lang als de belastingwet vereist.",
        ],
      },
      {
        heading: "Waarom we het gebruiken",
        paragraphs: [
          "Om Twapza aan je te leveren (onze overeenkomst met jou): je video's verwerken, je account, je abonnement en betalingen.",
          "Om Twapza veilig en werkend te houden (ons gerechtvaardigd belang): beveiliging, misbruik voorkomen, problemen oplossen.",
          "Om aan wettelijke plichten te voldoen, zoals het bewaren van betaalgegevens.",
          "We mailen je alleen over je account (bijvoorbeeld een wachtwoordreset). We sturen geen marketingmails zonder je toestemming en verkopen je gegevens nooit.",
        ],
      },
      {
        heading: "Wie ons helpt",
        paragraphs: [
          "Hetzner Online (Duitsland) host onze servers en slaat je gegevens op. Transcriptie draait op onze eigen server.",
          "Anthropic (Claude AI, Verenigde Staten) ontvangt de tekst van het transcript van je video om de beste momenten te vinden en titels en beschrijvingen te schrijven. Je videobestand zelf wordt niet verstuurd. Anthropic gebruikt deze gegevens niet om zijn modellen te trainen.",
          "Creem verwerkt betalingen en, als merchant of record, de belastingen. Voor je betaling geldt het privacybeleid van Creem.",
          "Een e-maildienst verstuurt accountmails zoals wachtwoordresets.",
          "Als er iets misgaat, kunnen technische gegevens over de fout (nooit je video's of accountgegevens) naar een dienst voor foutmeldingen worden gestuurd, zodat we het kunnen oplossen.",
          "Als deze diensten gegevens buiten de EU verwerken, gebeurt dat met passende waarborgen, zoals de modelcontractbepalingen van de EU.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "We gebruiken één cookie die je ingelogd houdt, en de opslag van je browser om je taal en downloadinstellingen te onthouden. Die zijn nodig om Twapza te laten werken. We gebruiken geen analyse-, advertentie- of trackingcookies.",
        ],
      },
      {
        heading: "Je rechten",
        paragraphs: [
          "Je kunt vragen om je gegevens in te zien, te corrigeren, te verwijderen of een kopie te krijgen, en bezwaar maken tegen of beperking vragen van het gebruik. Je account en al je gegevens kun je zelf verwijderen op de Accountpagina. Voor al het andere: mail naar twapza@gmail.com; we antwoorden binnen een maand.",
          "Je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens of de toezichthouder in je eigen land.",
        ],
      },
      {
        heading: "Kinderen",
        paragraphs: ["Twapza is niet bedoeld voor mensen jonger dan 16 jaar."],
      },
      {
        heading: "Wijzigingen",
        paragraphs: [
          "Als we dit beleid wijzigen, passen we de datum op deze pagina aan. Bij belangrijke wijzigingen laten we het je weten per e-mail of in de app.",
        ],
      },
    ],
  },

  es: {
    title: "Política de privacidad",
    intro:
      "Twapza (www.twapza.io) convierte tus vídeos largos en clips cortos. Esta política explica qué datos personales usamos, por qué y cuáles son tus derechos. Twapza se gestiona desde los Países Bajos y cumple el Reglamento General de Protección de Datos de la UE (RGPD). ¿Preguntas? Escribe a twapza@gmail.com.",
    sections: [
      {
        heading: "Qué recopilamos",
        paragraphs: [
          "Cuenta: tu correo electrónico, tu contraseña (guardada solo como hash seguro, nunca legible), tu idioma y tu plan.",
          "Tus vídeos: los archivos que subes o los enlaces de YouTube que importas, y todo lo que creamos a partir de ellos (vista previa, audio, transcripción, clips, textos y descripciones).",
          "Uso: cuántos minutos de vídeo procesas cada mes, para aplicar los límites de tu plan.",
          "Pagos: Creem gestiona los pagos. Nunca vemos ni guardamos los datos de tu tarjeta; solo recibimos el estado de tu suscripción y un ID de cliente de Creem.",
          "Datos técnicos: tu dirección IP y las solicitudes del navegador, usadas brevemente por seguridad y para frenar abusos (por ejemplo, demasiados intentos de inicio de sesión).",
        ],
      },
      {
        heading: "Cuánto tiempo lo guardamos",
        paragraphs: [
          "Los vídeos y todo lo creado a partir de ellos se eliminan automáticamente 24 horas después de añadirlos, o al instante si eliminas el proyecto. Tu archivo original nunca se modifica.",
          "Tu cuenta y tus registros de uso se conservan hasta que eliminas tu cuenta (página de Cuenta → Eliminar cuenta). Creem conserva los registros de pago durante el tiempo que exija la ley fiscal.",
        ],
      },
      {
        heading: "Para qué lo usamos",
        paragraphs: [
          "Para prestarte Twapza (nuestro contrato contigo): procesar tus vídeos, tu cuenta, tu plan y los pagos.",
          "Para mantener Twapza seguro y en funcionamiento (nuestro interés legítimo): seguridad, prevención de abusos y resolución de problemas.",
          "Para cumplir obligaciones legales, como conservar registros de pago.",
          "Solo te escribimos sobre tu cuenta (por ejemplo, para restablecer la contraseña). No enviamos correos de marketing sin tu permiso y nunca vendemos tus datos.",
        ],
      },
      {
        heading: "Quién nos ayuda",
        paragraphs: [
          "Hetzner Online (Alemania) aloja nuestros servidores y guarda tus datos. La transcripción se realiza en nuestro propio servidor.",
          "Anthropic (Claude AI, Estados Unidos) recibe el texto de la transcripción de tu vídeo para encontrar los mejores momentos y escribir títulos y descripciones. Tu archivo de vídeo no se envía. Anthropic no usa estos datos para entrenar sus modelos.",
          "Creem gestiona los pagos y, como merchant of record, los impuestos. Para tu pago se aplica la política de privacidad de Creem.",
          "Un servicio de correo envía los mensajes de la cuenta, como el restablecimiento de contraseña.",
          "Cuando algo falla, los detalles técnicos del error (nunca tus vídeos ni los datos de tu cuenta) pueden enviarse a un servicio de seguimiento de errores para que podamos corregirlo.",
          "Cuando estos servicios tratan datos fuera de la UE, lo hacen con garantías adecuadas, como las cláusulas contractuales tipo de la UE.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Usamos una cookie que mantiene tu sesión iniciada y el almacenamiento del navegador para recordar tu idioma y tus ajustes de descarga. Son necesarios para que Twapza funcione. No usamos cookies de analítica, publicidad ni seguimiento.",
        ],
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          "Puedes pedir ver, corregir, eliminar o recibir una copia de tus datos, y oponerte a su uso o limitarlo. Puedes eliminar tu cuenta y todos tus datos tú mismo en la página de Cuenta. Para todo lo demás, escribe a twapza@gmail.com; respondemos en un plazo de un mes.",
          "También puedes presentar una reclamación ante la autoridad neerlandesa de protección de datos (Autoriteit Persoonsgegevens) o la autoridad de tu país.",
        ],
      },
      {
        heading: "Menores",
        paragraphs: ["Twapza no está pensado para menores de 16 años."],
      },
      {
        heading: "Cambios",
        paragraphs: [
          "Si cambiamos esta política, actualizamos la fecha de esta página. Si los cambios son importantes, te avisaremos por correo o en la aplicación.",
        ],
      },
    ],
  },

  de: {
    title: "Datenschutzerklärung",
    intro:
      "Twapza (www.twapza.io) macht aus deinen langen Videos kurze Clips. Diese Erklärung beschreibt, welche personenbezogenen Daten wir nutzen, warum, und welche Rechte du hast. Twapza wird aus den Niederlanden betrieben und hält sich an die Datenschutz-Grundverordnung (DSGVO). Fragen? Schreib an twapza@gmail.com.",
    sections: [
      {
        heading: "Was wir erheben",
        paragraphs: [
          "Konto: deine E-Mail-Adresse, dein Passwort (nur als sicherer Hash gespeichert, nie lesbar), deine Sprache und dein Plan.",
          "Deine Videos: Dateien, die du hochlädst, oder YouTube-Links, die du importierst, und alles, was wir daraus erstellen (Vorschau, Audio, Transkript, Clips, Texte und Beschreibungen).",
          "Nutzung: wie viele Videominuten du pro Monat verarbeitest, damit wir die Limits deines Plans anwenden können.",
          "Zahlungen: Creem wickelt die Zahlungen ab. Wir sehen oder speichern deine Kartendaten nie; wir erhalten nur den Status deines Abos und eine Creem-Kundennummer.",
          "Technische Daten: deine IP-Adresse und Browseranfragen, kurz genutzt für Sicherheit und gegen Missbrauch (zum Beispiel zu viele Anmeldeversuche).",
        ],
      },
      {
        heading: "Wie lange wir Daten speichern",
        paragraphs: [
          "Videos und alles, was daraus erstellt wurde, werden 24 Stunden nach dem Hinzufügen automatisch gelöscht, oder sofort, wenn du das Projekt löschst. Deine Originaldatei wird nie verändert.",
          "Dein Konto und deine Nutzungsdaten bleiben gespeichert, bis du dein Konto löschst (Kontoseite → Konto löschen). Zahlungsunterlagen bewahrt Creem so lange auf, wie das Steuerrecht es verlangt.",
        ],
      },
      {
        heading: "Wofür wir sie nutzen",
        paragraphs: [
          "Um dir Twapza bereitzustellen (unser Vertrag mit dir): deine Videos, dein Konto, deinen Plan und Zahlungen verarbeiten.",
          "Um Twapza sicher und funktionsfähig zu halten (unser berechtigtes Interesse): Sicherheit, Missbrauch verhindern, Probleme beheben.",
          "Um gesetzliche Pflichten zu erfüllen, etwa das Aufbewahren von Zahlungsunterlagen.",
          "Wir schreiben dir nur zu deinem Konto (zum Beispiel zum Zurücksetzen des Passworts). Ohne deine Einwilligung senden wir keine Werbe-E-Mails, und wir verkaufen deine Daten nie.",
        ],
      },
      {
        heading: "Wer uns hilft",
        paragraphs: [
          "Hetzner Online (Deutschland) hostet unsere Server und speichert deine Daten. Die Transkription läuft auf unserem eigenen Server.",
          "Anthropic (Claude AI, USA) erhält den Text des Transkripts deines Videos, um die besten Momente zu finden und Titel und Beschreibungen zu schreiben. Deine Videodatei selbst wird nicht gesendet. Anthropic nutzt diese Daten nicht zum Training seiner Modelle.",
          "Creem wickelt Zahlungen und, als Merchant of Record, die Steuern ab. Für deine Zahlung gilt die Datenschutzerklärung von Creem.",
          "Ein E-Mail-Dienst versendet Konto-E-Mails wie das Zurücksetzen des Passworts.",
          "Wenn etwas schiefgeht, können technische Angaben zum Fehler (nie deine Videos oder Kontodaten) an einen Dienst zur Fehlererfassung gesendet werden, damit wir ihn beheben können.",
          "Wenn diese Dienste Daten außerhalb der EU verarbeiten, geschieht das mit geeigneten Garantien wie den EU-Standardvertragsklauseln.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Wir verwenden ein Cookie, das dich angemeldet hält, und den Speicher deines Browsers, um deine Sprache und Download-Einstellungen zu merken. Beides ist für Twapza notwendig. Wir verwenden keine Analyse-, Werbe- oder Tracking-Cookies.",
        ],
      },
      {
        heading: "Deine Rechte",
        paragraphs: [
          "Du kannst Auskunft, Berichtigung, Löschung oder eine Kopie deiner Daten verlangen und der Nutzung widersprechen oder sie einschränken lassen. Dein Konto und alle deine Daten kannst du selbst auf der Kontoseite löschen. Für alles andere schreib an twapza@gmail.com; wir antworten innerhalb eines Monats.",
          "Du kannst dich auch bei der niederländischen Datenschutzbehörde (Autoriteit Persoonsgegevens) oder der Behörde in deinem Land beschweren.",
        ],
      },
      {
        heading: "Kinder",
        paragraphs: ["Twapza ist nicht für Personen unter 16 Jahren gedacht."],
      },
      {
        heading: "Änderungen",
        paragraphs: [
          "Wenn wir diese Erklärung ändern, aktualisieren wir das Datum auf dieser Seite. Über wichtige Änderungen informieren wir dich per E-Mail oder in der App.",
        ],
      },
    ],
  },

  fr: {
    title: "Politique de confidentialité",
    intro:
      "Twapza (www.twapza.io) transforme vos longues vidéos en clips courts. Cette politique explique quelles données personnelles nous utilisons, pourquoi, et quels sont vos droits. Twapza est exploité depuis les Pays-Bas et respecte le Règlement général sur la protection des données (RGPD). Des questions ? Écrivez à twapza@gmail.com.",
    sections: [
      {
        heading: "Ce que nous collectons",
        paragraphs: [
          "Compte : votre adresse e-mail, votre mot de passe (stocké uniquement sous forme de hachage sécurisé, jamais lisible), votre langue et votre offre.",
          "Vos vidéos : les fichiers que vous importez ou les liens YouTube que vous ajoutez, et tout ce que nous en tirons (aperçu, audio, transcription, clips, textes et descriptions).",
          "Utilisation : le nombre de minutes de vidéo traitées chaque mois, pour appliquer les limites de votre offre.",
          "Paiements : Creem gère les paiements. Nous ne voyons ni ne stockons jamais vos données de carte ; nous recevons seulement le statut de votre abonnement et un identifiant client Creem.",
          "Données techniques : votre adresse IP et les requêtes du navigateur, utilisées brièvement pour la sécurité et contre les abus (par exemple trop de tentatives de connexion).",
        ],
      },
      {
        heading: "Durée de conservation",
        paragraphs: [
          "Les vidéos et tout ce qui en est tiré sont supprimés automatiquement 24 heures après leur ajout, ou immédiatement si vous supprimez le projet. Votre fichier original n'est jamais modifié.",
          "Votre compte et vos données d'utilisation sont conservés jusqu'à la suppression de votre compte (page Compte → Supprimer le compte). Creem conserve les données de paiement aussi longtemps que la loi fiscale l'exige.",
        ],
      },
      {
        heading: "Pourquoi nous les utilisons",
        paragraphs: [
          "Pour vous fournir Twapza (notre contrat avec vous) : traiter vos vidéos, votre compte, votre offre et vos paiements.",
          "Pour garder Twapza sûr et fonctionnel (notre intérêt légitime) : sécurité, prévention des abus, résolution des problèmes.",
          "Pour respecter nos obligations légales, comme la conservation des données de paiement.",
          "Nous ne vous écrivons qu'au sujet de votre compte (par exemple pour réinitialiser votre mot de passe). Nous n'envoyons pas d'e-mails marketing sans votre accord et ne vendons jamais vos données.",
        ],
      },
      {
        heading: "Qui nous aide",
        paragraphs: [
          "Hetzner Online (Allemagne) héberge nos serveurs et stocke vos données. La transcription s'effectue sur notre propre serveur.",
          "Anthropic (Claude AI, États-Unis) reçoit le texte de la transcription de votre vidéo pour trouver les meilleurs moments et rédiger titres et descriptions. Votre fichier vidéo n'est pas envoyé. Anthropic n'utilise pas ces données pour entraîner ses modèles.",
          "Creem gère les paiements et, en tant que merchant of record, les taxes. La politique de confidentialité de Creem s'applique à votre paiement.",
          "Un service d'e-mail envoie les messages liés au compte, comme la réinitialisation du mot de passe.",
          "En cas de problème, des détails techniques sur l'erreur (jamais vos vidéos ni les données de votre compte) peuvent être envoyés à un service de suivi des erreurs pour que nous puissions la corriger.",
          "Lorsque ces services traitent des données hors de l'UE, ils le font avec des garanties appropriées, comme les clauses contractuelles types de l'UE.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Nous utilisons un cookie qui vous garde connecté, et le stockage de votre navigateur pour retenir votre langue et vos réglages de téléchargement. Ils sont nécessaires au fonctionnement de Twapza. Nous n'utilisons aucun cookie d'analyse, de publicité ou de suivi.",
        ],
      },
      {
        heading: "Vos droits",
        paragraphs: [
          "Vous pouvez demander à consulter, corriger, supprimer ou recevoir une copie de vos données, et vous opposer à leur utilisation ou la limiter. Vous pouvez supprimer vous-même votre compte et toutes vos données sur la page Compte. Pour toute autre demande, écrivez à twapza@gmail.com ; nous répondons sous un mois.",
          "Vous pouvez aussi déposer une plainte auprès de l'autorité néerlandaise de protection des données (Autoriteit Persoonsgegevens) ou de l'autorité de votre pays.",
        ],
      },
      {
        heading: "Enfants",
        paragraphs: ["Twapza n'est pas destiné aux personnes de moins de 16 ans."],
      },
      {
        heading: "Modifications",
        paragraphs: [
          "Si nous modifions cette politique, nous mettons à jour la date sur cette page. Pour les changements importants, nous vous prévenons par e-mail ou dans l'application.",
        ],
      },
    ],
  },

  ar: {
    title: "سياسة الخصوصية",
    intro:
      "يحوّل Twapza (www.twapza.io) فيديوهاتك الطويلة إلى مقاطع قصيرة. توضح هذه السياسة البيانات الشخصية التي نستخدمها ولماذا، وما هي حقوقك. يُدار Twapza من هولندا ويلتزم باللائحة العامة لحماية البيانات في الاتحاد الأوروبي (GDPR). لديك أسئلة؟ راسلنا على twapza@gmail.com.",
    sections: [
      {
        heading: "ما الذي نجمعه",
        paragraphs: [
          "الحساب: بريدك الإلكتروني، وكلمة المرور (تُحفظ فقط كقيمة مشفّرة آمنة ولا يمكن قراءتها)، ولغتك، وخطتك.",
          "فيديوهاتك: الملفات التي ترفعها أو روابط يوتيوب التي تستوردها، وكل ما ننشئه منها (المعاينة، والصوت، والنص المفرّغ، والمقاطع، والنصوص والأوصاف).",
          "الاستخدام: عدد دقائق الفيديو التي تعالجها كل شهر، لتطبيق حدود خطتك.",
          "المدفوعات: تتولى Creem المدفوعات. لا نرى بيانات بطاقتك ولا نحفظها أبدًا؛ نتلقى فقط حالة اشتراكك ورقم عميل لدى Creem.",
          "البيانات التقنية: عنوان IP وطلبات المتصفح، نستخدمها لفترة قصيرة للأمان ومنع إساءة الاستخدام (مثل كثرة محاولات تسجيل الدخول).",
        ],
      },
      {
        heading: "مدة الاحتفاظ",
        paragraphs: [
          "تُحذف الفيديوهات وكل ما أُنشئ منها تلقائيًا بعد 24 ساعة من إضافتها، أو فورًا عند حذف المشروع. لا يُعدَّل ملفك الأصلي أبدًا.",
          "يبقى حسابك وسجلات استخدامك حتى تحذف حسابك (صفحة الحساب ← حذف الحساب). تحتفظ Creem بسجلات الدفع للمدة التي يفرضها قانون الضرائب.",
        ],
      },
      {
        heading: "لماذا نستخدمها",
        paragraphs: [
          "لتقديم Twapza لك (اتفاقنا معك): معالجة فيديوهاتك وحسابك وخطتك ومدفوعاتك.",
          "للحفاظ على أمان Twapza وعمله (مصلحتنا المشروعة): الأمان، ومنع إساءة الاستخدام، وإصلاح المشكلات.",
          "للوفاء بالالتزامات القانونية، مثل الاحتفاظ بسجلات الدفع.",
          "لا نراسلك إلا بشأن حسابك (مثل إعادة تعيين كلمة المرور). لا نرسل رسائل تسويقية دون إذنك، ولا نبيع بياناتك أبدًا.",
        ],
      },
      {
        heading: "من يساعدنا",
        paragraphs: [
          "تستضيف Hetzner Online (ألمانيا) خوادمنا وتخزّن بياناتك. يجري التفريغ النصي على خادمنا الخاص.",
          "تتلقى Anthropic (Claude AI، الولايات المتحدة) نص تفريغ الفيديو لإيجاد أفضل اللحظات وكتابة العناوين والأوصاف. لا يُرسل ملف الفيديو نفسه. لا تستخدم Anthropic هذه البيانات لتدريب نماذجها.",
          "تتولى Creem المدفوعات، وبصفتها البائع المسجّل (merchant of record) تتولى الضرائب أيضًا. تنطبق سياسة خصوصية Creem على عملية الدفع.",
          "ترسل خدمة بريد إلكتروني رسائل الحساب مثل إعادة تعيين كلمة المرور.",
          "عند حدوث خطأ، قد تُرسل تفاصيل تقنية عنه (وليس فيديوهاتك أو بيانات حسابك أبدًا) إلى خدمة لتتبع الأخطاء حتى نتمكن من إصلاحه.",
          "عندما تعالج هذه الخدمات البيانات خارج الاتحاد الأوروبي، يتم ذلك بضمانات مناسبة مثل البنود التعاقدية القياسية للاتحاد الأوروبي.",
        ],
      },
      {
        heading: "ملفات تعريف الارتباط",
        paragraphs: [
          "نستخدم ملف تعريف ارتباط واحدًا يبقيك مسجّل الدخول، ومساحة التخزين في متصفحك لتذكّر لغتك وإعدادات التنزيل. هذه ضرورية لعمل Twapza. لا نستخدم ملفات تعريف ارتباط للتحليلات أو الإعلانات أو التتبع.",
        ],
      },
      {
        heading: "حقوقك",
        paragraphs: [
          "يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها أو الحصول على نسخة منها، والاعتراض على استخدامها أو تقييده. يمكنك حذف حسابك وكل بياناتك بنفسك من صفحة الحساب. لأي طلب آخر راسلنا على twapza@gmail.com؛ نرد خلال شهر.",
          "يمكنك أيضًا تقديم شكوى إلى هيئة حماية البيانات الهولندية (Autoriteit Persoonsgegevens) أو الهيئة المختصة في بلدك.",
        ],
      },
      {
        heading: "الأطفال",
        paragraphs: ["Twapza غير مخصص لمن هم دون 16 عامًا."],
      },
      {
        heading: "التغييرات",
        paragraphs: [
          "إذا غيّرنا هذه السياسة، نحدّث التاريخ في هذه الصفحة. وعند التغييرات المهمة نبلغك بالبريد الإلكتروني أو داخل التطبيق.",
        ],
      },
    ],
  },
};
