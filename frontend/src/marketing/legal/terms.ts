import type { Lang } from "../../i18n";
import type { LegalDoc } from "./types";

/** Terms of service. Keep plans/limits in sync with backend/twapza/accounts/plans.py. */
export const TERMS: Record<Lang, LegalDoc> = {
  en: {
    title: "Terms of service",
    intro:
      "These terms apply when you use Twapza (www.twapza.io), a service run from the Netherlands. By creating an account you agree to them. Please read them; they're kept short.",
    sections: [
      {
        heading: "Your account",
        paragraphs: [
          "You must be at least 16 and give a working email address. Keep your password to yourself: you're responsible for what happens in your account. One account per person.",
        ],
      },
      {
        heading: "Your videos",
        paragraphs: [
          "Only use videos you own or have permission to use. You confirm this for every video. You keep all rights to your videos and clips.",
          "You let Twapza process your videos only to provide the service to you (making previews, transcripts and clips). Everything is deleted automatically after 24 hours.",
          "You're responsible for what you publish, including crediting other creators and following the rules of YouTube, TikTok and other platforms.",
        ],
      },
      {
        heading: "Fair use",
        paragraphs: [
          "Don't use Twapza for illegal content, content that infringes other people's rights, or to harm others. Don't try to break, overload or get around the limits of the service, and don't resell access.",
          "We may suspend or close an account that breaks these rules.",
        ],
      },
      {
        heading: "AI suggestions",
        paragraphs: [
          "Highlights, captions, titles and descriptions are made automatically and can contain mistakes. Check your clips before you publish them.",
        ],
      },
      {
        heading: "Plans and payments",
        paragraphs: [
          "Twapza has a free plan and paid plans (Creator and Pro), billed monthly or yearly. What each plan includes is shown on the Pricing page.",
          "Payments are processed by Stripe, which sells the subscription as merchant of record and adds VAT or sales tax where it applies. Stripe's terms also apply to your payment.",
          "Subscriptions renew automatically until you cancel. You can cancel any time on your Account page (Manage subscription); your plan stays active until the end of the period you paid for. Unused minutes don't carry over. When you switch plans, the price difference is calculated pro rata.",
        ],
      },
      {
        heading: "Refunds",
        paragraphs: [
          "Payments for a period that has started are not refunded, except where the law requires it.",
          "If you live in the EU, you may withdraw from your first purchase within 14 days. Because you ask us to start the service right away, you may have to pay for the part you already used. To withdraw, email twapza@gmail.com.",
        ],
      },
      {
        heading: "The service",
        paragraphs: [
          "We work hard to keep Twapza running, but we can't promise it will always be available or free of errors. We may improve or change features; if a change significantly affects a paid plan, we'll tell you in advance.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "Twapza is provided as it is. Our total liability is limited to the amount you paid us in the 12 months before the damage. We're not liable for indirect damage such as lost views or income. Nothing in these terms limits liability that can't be limited by law, or your rights as a consumer.",
        ],
      },
      {
        heading: "Ending",
        paragraphs: [
          "You can delete your account at any time on the Account page; this also cancels your subscription.",
        ],
      },
      {
        heading: "Changes and law",
        paragraphs: [
          "We may update these terms. For important changes we'll let you know by email or in the app before they apply.",
          "Dutch law applies, and disputes go to the competent court in the Netherlands. If you're a consumer, you keep the protection of the mandatory rules of the country where you live.",
          "Questions or problems? Email twapza@gmail.com.",
        ],
      },
    ],
  },

  nl: {
    title: "Algemene voorwaarden",
    intro:
      "Deze voorwaarden gelden als je Twapza (www.twapza.io) gebruikt, een dienst die vanuit Nederland wordt gerund. Door een account te maken ga je ermee akkoord. Lees ze even; we houden ze kort.",
    sections: [
      {
        heading: "Je account",
        paragraphs: [
          "Je moet minstens 16 jaar zijn en een werkend e-mailadres opgeven. Houd je wachtwoord voor jezelf: je bent verantwoordelijk voor wat er in je account gebeurt. Eén account per persoon.",
        ],
      },
      {
        heading: "Je video's",
        paragraphs: [
          "Gebruik alleen video's die van jou zijn of die je mag gebruiken. Dat bevestig je bij elke video. Alle rechten op je video's en clips blijven bij jou.",
          "Je geeft Twapza toestemming om je video's te verwerken, alleen om de dienst aan jou te leveren (previews, transcripten en clips maken). Alles wordt na 24 uur automatisch verwijderd.",
          "Jij bent verantwoordelijk voor wat je publiceert, ook voor het vermelden van andere makers en het volgen van de regels van YouTube, TikTok en andere platforms.",
        ],
      },
      {
        heading: "Eerlijk gebruik",
        paragraphs: [
          "Gebruik Twapza niet voor illegale inhoud, inhoud die de rechten van anderen schendt, of om anderen te schaden. Probeer de dienst niet te breken, te overbelasten of de limieten te omzeilen, en verkoop geen toegang door.",
          "We kunnen een account dat deze regels overtreedt blokkeren of sluiten.",
        ],
      },
      {
        heading: "AI-suggesties",
        paragraphs: [
          "Highlights, ondertitels, titels en beschrijvingen worden automatisch gemaakt en kunnen fouten bevatten. Controleer je clips voordat je ze publiceert.",
        ],
      },
      {
        heading: "Abonnementen en betalingen",
        paragraphs: [
          "Twapza heeft een gratis abonnement en betaalde abonnementen (Creator en Pro), per maand of per jaar. Wat elk abonnement bevat, staat op de pagina Prijzen.",
          "Betalingen worden verwerkt door Stripe, dat het abonnement als merchant of record verkoopt en btw of omzetbelasting toevoegt waar dat geldt. Voor je betaling gelden ook de voorwaarden van Stripe.",
          "Abonnementen worden automatisch verlengd tot je opzegt. Je kunt altijd opzeggen op je Accountpagina (Abonnement beheren); je abonnement blijft actief tot het einde van de periode waarvoor je hebt betaald. Ongebruikte minuten gaan niet mee naar de volgende maand. Als je van abonnement wisselt, wordt het prijsverschil naar rato berekend.",
        ],
      },
      {
        heading: "Terugbetalingen",
        paragraphs: [
          "Betalingen voor een periode die al begonnen is, worden niet terugbetaald, behalve als de wet dat vereist.",
          "Woon je in de EU, dan kun je je eerste aankoop binnen 14 dagen herroepen. Omdat je vraagt om de dienst meteen te starten, kan het zijn dat je betaalt voor het deel dat je al gebruikt hebt. Mail om te herroepen naar twapza@gmail.com.",
        ],
      },
      {
        heading: "De dienst",
        paragraphs: [
          "We doen ons best om Twapza draaiende te houden, maar kunnen niet beloven dat het altijd beschikbaar of foutloos is. We kunnen functies verbeteren of wijzigen; als een wijziging een betaald abonnement flink raakt, laten we het je vooraf weten.",
        ],
      },
      {
        heading: "Aansprakelijkheid",
        paragraphs: [
          "Twapza wordt geleverd zoals het is. Onze aansprakelijkheid is in totaal beperkt tot het bedrag dat je ons in de 12 maanden vóór de schade hebt betaald. We zijn niet aansprakelijk voor indirecte schade, zoals gemiste views of inkomsten. Niets in deze voorwaarden beperkt aansprakelijkheid die volgens de wet niet beperkt mag worden, of je rechten als consument.",
        ],
      },
      {
        heading: "Stoppen",
        paragraphs: [
          "Je kunt je account altijd verwijderen op de Accountpagina; daarmee wordt ook je abonnement opgezegd.",
        ],
      },
      {
        heading: "Wijzigingen en recht",
        paragraphs: [
          "We kunnen deze voorwaarden aanpassen. Bij belangrijke wijzigingen laten we het je per e-mail of in de app weten voordat ze ingaan.",
          "Op deze voorwaarden is Nederlands recht van toepassing, en geschillen worden voorgelegd aan de bevoegde rechter in Nederland. Ben je consument, dan houd je de bescherming van de dwingende regels van het land waar je woont.",
          "Vragen of problemen? Mail naar twapza@gmail.com.",
        ],
      },
    ],
  },

  es: {
    title: "Términos del servicio",
    intro:
      "Estos términos se aplican cuando usas Twapza (www.twapza.io), un servicio gestionado desde los Países Bajos. Al crear una cuenta los aceptas. Léelos, por favor; son breves.",
    sections: [
      {
        heading: "Tu cuenta",
        paragraphs: [
          "Debes tener al menos 16 años e indicar un correo que funcione. No compartas tu contraseña: eres responsable de lo que ocurra en tu cuenta. Una cuenta por persona.",
        ],
      },
      {
        heading: "Tus vídeos",
        paragraphs: [
          "Usa solo vídeos que sean tuyos o que tengas permiso para usar. Lo confirmas con cada vídeo. Conservas todos los derechos sobre tus vídeos y clips.",
          "Permites que Twapza procese tus vídeos solo para prestarte el servicio (crear vistas previas, transcripciones y clips). Todo se elimina automáticamente a las 24 horas.",
          "Eres responsable de lo que publicas, incluido dar crédito a otros creadores y seguir las normas de YouTube, TikTok y otras plataformas.",
        ],
      },
      {
        heading: "Uso justo",
        paragraphs: [
          "No uses Twapza para contenido ilegal, contenido que infrinja derechos de otros ni para perjudicar a nadie. No intentes romper, sobrecargar o saltarte los límites del servicio, ni revender el acceso.",
          "Podemos suspender o cerrar una cuenta que incumpla estas normas.",
        ],
      },
      {
        heading: "Sugerencias de IA",
        paragraphs: [
          "Los momentos destacados, subtítulos, títulos y descripciones se crean automáticamente y pueden contener errores. Revisa tus clips antes de publicarlos.",
        ],
      },
      {
        heading: "Planes y pagos",
        paragraphs: [
          "Twapza tiene un plan gratuito y planes de pago (Creator y Pro), con facturación mensual o anual. Lo que incluye cada plan se muestra en la página de Precios.",
          "Los pagos los procesa Stripe, que vende la suscripción como merchant of record y añade el IVA o los impuestos sobre ventas cuando corresponda. Los términos de Stripe también se aplican a tu pago.",
          "Las suscripciones se renuevan automáticamente hasta que las canceles. Puedes cancelar en cualquier momento desde tu página de Cuenta (Gestionar suscripción); tu plan sigue activo hasta el final del periodo pagado. Los minutos no usados no se acumulan. Si cambias de plan, la diferencia de precio se calcula de forma proporcional.",
        ],
      },
      {
        heading: "Reembolsos",
        paragraphs: [
          "Los pagos de un periodo ya iniciado no se reembolsan, salvo cuando lo exija la ley.",
          "Si vives en la UE, puedes desistir de tu primera compra en un plazo de 14 días. Como nos pides empezar el servicio de inmediato, es posible que debas pagar la parte que ya has usado. Para desistir, escribe a twapza@gmail.com.",
        ],
      },
      {
        heading: "El servicio",
        paragraphs: [
          "Nos esforzamos por mantener Twapza en marcha, pero no podemos prometer que esté siempre disponible o libre de errores. Podemos mejorar o cambiar funciones; si un cambio afecta de forma importante a un plan de pago, te avisaremos con antelación.",
        ],
      },
      {
        heading: "Responsabilidad",
        paragraphs: [
          "Twapza se ofrece tal cual. Nuestra responsabilidad total se limita a lo que nos hayas pagado en los 12 meses anteriores al daño. No respondemos de daños indirectos, como visualizaciones o ingresos perdidos. Nada en estos términos limita la responsabilidad que la ley no permite limitar ni tus derechos como consumidor.",
        ],
      },
      {
        heading: "Finalización",
        paragraphs: [
          "Puedes eliminar tu cuenta en cualquier momento desde la página de Cuenta; esto también cancela tu suscripción.",
        ],
      },
      {
        heading: "Cambios y ley aplicable",
        paragraphs: [
          "Podemos actualizar estos términos. Si los cambios son importantes, te avisaremos por correo o en la aplicación antes de que entren en vigor.",
          "Se aplica la ley neerlandesa y los conflictos se someten al tribunal competente de los Países Bajos. Si eres consumidor, conservas la protección de las normas imperativas del país donde vives.",
          "¿Preguntas o problemas? Escribe a twapza@gmail.com.",
        ],
      },
    ],
  },

  de: {
    title: "Nutzungsbedingungen",
    intro:
      "Diese Bedingungen gelten, wenn du Twapza (www.twapza.io) nutzt, einen Dienst, der aus den Niederlanden betrieben wird. Mit dem Erstellen eines Kontos stimmst du ihnen zu. Bitte lies sie; sie sind kurz.",
    sections: [
      {
        heading: "Dein Konto",
        paragraphs: [
          "Du musst mindestens 16 Jahre alt sein und eine funktionierende E-Mail-Adresse angeben. Behalte dein Passwort für dich: Du bist für alles verantwortlich, was in deinem Konto passiert. Ein Konto pro Person.",
        ],
      },
      {
        heading: "Deine Videos",
        paragraphs: [
          "Nutze nur Videos, die dir gehören oder die du verwenden darfst. Das bestätigst du bei jedem Video. Alle Rechte an deinen Videos und Clips bleiben bei dir.",
          "Du erlaubst Twapza, deine Videos nur zu verarbeiten, um dir den Dienst bereitzustellen (Vorschauen, Transkripte und Clips erstellen). Alles wird nach 24 Stunden automatisch gelöscht.",
          "Du bist für das verantwortlich, was du veröffentlichst, auch für die Nennung anderer Creator und die Einhaltung der Regeln von YouTube, TikTok und anderen Plattformen.",
        ],
      },
      {
        heading: "Faire Nutzung",
        paragraphs: [
          "Nutze Twapza nicht für illegale Inhalte, Inhalte, die Rechte anderer verletzen, oder um anderen zu schaden. Versuche nicht, den Dienst zu stören, zu überlasten oder seine Limits zu umgehen, und verkaufe keinen Zugang weiter.",
          "Wir können ein Konto sperren oder schließen, das gegen diese Regeln verstößt.",
        ],
      },
      {
        heading: "KI-Vorschläge",
        paragraphs: [
          "Highlights, Untertitel, Titel und Beschreibungen werden automatisch erstellt und können Fehler enthalten. Prüfe deine Clips, bevor du sie veröffentlichst.",
        ],
      },
      {
        heading: "Pläne und Zahlungen",
        paragraphs: [
          "Twapza hat einen kostenlosen Plan und bezahlte Pläne (Creator und Pro), monatlich oder jährlich abgerechnet. Was jeder Plan enthält, steht auf der Preisseite.",
          "Zahlungen werden von Stripe abgewickelt, das das Abo als Merchant of Record verkauft und, wo nötig, MwSt. oder Umsatzsteuer hinzufügt. Für deine Zahlung gelten auch die Bedingungen von Stripe.",
          "Abos verlängern sich automatisch, bis du kündigst. Du kannst jederzeit auf deiner Kontoseite kündigen (Abo verwalten); dein Plan bleibt bis zum Ende des bezahlten Zeitraums aktiv. Ungenutzte Minuten verfallen. Beim Planwechsel wird der Preisunterschied anteilig berechnet.",
        ],
      },
      {
        heading: "Erstattungen",
        paragraphs: [
          "Zahlungen für einen bereits begonnenen Zeitraum werden nicht erstattet, außer wenn das Gesetz es verlangt.",
          "Wenn du in der EU wohnst, kannst du deinen ersten Kauf innerhalb von 14 Tagen widerrufen. Da du verlangst, dass der Dienst sofort beginnt, musst du eventuell für den bereits genutzten Teil bezahlen. Für den Widerruf schreib an twapza@gmail.com.",
        ],
      },
      {
        heading: "Der Dienst",
        paragraphs: [
          "Wir tun viel dafür, dass Twapza läuft, können aber nicht versprechen, dass es immer verfügbar oder fehlerfrei ist. Wir können Funktionen verbessern oder ändern; wenn eine Änderung einen bezahlten Plan erheblich betrifft, sagen wir dir vorher Bescheid.",
        ],
      },
      {
        heading: "Haftung",
        paragraphs: [
          "Twapza wird so bereitgestellt, wie es ist. Unsere Haftung ist insgesamt auf den Betrag begrenzt, den du uns in den 12 Monaten vor dem Schaden gezahlt hast. Für indirekte Schäden wie entgangene Aufrufe oder Einnahmen haften wir nicht. Nichts in diesen Bedingungen beschränkt eine Haftung, die gesetzlich nicht beschränkt werden kann, oder deine Rechte als Verbraucher.",
        ],
      },
      {
        heading: "Beendigung",
        paragraphs: [
          "Du kannst dein Konto jederzeit auf der Kontoseite löschen; damit wird auch dein Abo gekündigt.",
        ],
      },
      {
        heading: "Änderungen und anwendbares Recht",
        paragraphs: [
          "Wir können diese Bedingungen anpassen. Über wichtige Änderungen informieren wir dich per E-Mail oder in der App, bevor sie gelten.",
          "Es gilt niederländisches Recht, und Streitigkeiten gehen an das zuständige Gericht in den Niederlanden. Als Verbraucher behältst du den Schutz der zwingenden Vorschriften des Landes, in dem du lebst.",
          "Fragen oder Probleme? Schreib an twapza@gmail.com.",
        ],
      },
    ],
  },

  fr: {
    title: "Conditions d'utilisation",
    intro:
      "Ces conditions s'appliquent lorsque vous utilisez Twapza (www.twapza.io), un service exploité depuis les Pays-Bas. En créant un compte, vous les acceptez. Prenez le temps de les lire ; elles sont courtes.",
    sections: [
      {
        heading: "Votre compte",
        paragraphs: [
          "Vous devez avoir au moins 16 ans et indiquer une adresse e-mail valide. Gardez votre mot de passe pour vous : vous êtes responsable de ce qui se passe dans votre compte. Un compte par personne.",
        ],
      },
      {
        heading: "Vos vidéos",
        paragraphs: [
          "N'utilisez que des vidéos qui vous appartiennent ou que vous avez le droit d'utiliser. Vous le confirmez pour chaque vidéo. Vous conservez tous les droits sur vos vidéos et vos clips.",
          "Vous autorisez Twapza à traiter vos vidéos uniquement pour vous fournir le service (aperçus, transcriptions et clips). Tout est supprimé automatiquement après 24 heures.",
          "Vous êtes responsable de ce que vous publiez, y compris de créditer les autres créateurs et de respecter les règles de YouTube, TikTok et des autres plateformes.",
        ],
      },
      {
        heading: "Utilisation loyale",
        paragraphs: [
          "N'utilisez pas Twapza pour du contenu illégal, du contenu qui porte atteinte aux droits d'autrui, ni pour nuire à quiconque. N'essayez pas de perturber, surcharger ou contourner les limites du service, et ne revendez pas l'accès.",
          "Nous pouvons suspendre ou fermer un compte qui enfreint ces règles.",
        ],
      },
      {
        heading: "Suggestions de l'IA",
        paragraphs: [
          "Les moments forts, sous-titres, titres et descriptions sont créés automatiquement et peuvent contenir des erreurs. Vérifiez vos clips avant de les publier.",
        ],
      },
      {
        heading: "Offres et paiements",
        paragraphs: [
          "Twapza propose une offre gratuite et des offres payantes (Creator et Pro), facturées au mois ou à l'année. Le contenu de chaque offre est indiqué sur la page Tarifs.",
          "Les paiements sont traités par Stripe, qui vend l'abonnement en tant que merchant of record et ajoute la TVA ou les taxes de vente le cas échéant. Les conditions de Stripe s'appliquent aussi à votre paiement.",
          "Les abonnements se renouvellent automatiquement jusqu'à leur résiliation. Vous pouvez résilier à tout moment sur votre page Compte (Gérer l'abonnement) ; votre offre reste active jusqu'à la fin de la période payée. Les minutes non utilisées ne sont pas reportées. En cas de changement d'offre, la différence de prix est calculée au prorata.",
        ],
      },
      {
        heading: "Remboursements",
        paragraphs: [
          "Les paiements d'une période déjà commencée ne sont pas remboursés, sauf si la loi l'exige.",
          "Si vous vivez dans l'UE, vous pouvez vous rétracter de votre premier achat dans un délai de 14 jours. Comme vous demandez que le service commence immédiatement, vous pourriez devoir payer la partie déjà utilisée. Pour vous rétracter, écrivez à twapza@gmail.com.",
        ],
      },
      {
        heading: "Le service",
        paragraphs: [
          "Nous faisons tout pour que Twapza fonctionne, mais ne pouvons pas promettre qu'il sera toujours disponible ou sans erreur. Nous pouvons améliorer ou modifier des fonctions ; si un changement affecte fortement une offre payante, nous vous prévenons à l'avance.",
        ],
      },
      {
        heading: "Responsabilité",
        paragraphs: [
          "Twapza est fourni en l'état. Notre responsabilité totale est limitée au montant que vous nous avez payé au cours des 12 mois précédant le dommage. Nous ne sommes pas responsables des dommages indirects, comme des vues ou revenus perdus. Rien dans ces conditions ne limite une responsabilité que la loi interdit de limiter, ni vos droits de consommateur.",
        ],
      },
      {
        heading: "Fin du contrat",
        paragraphs: [
          "Vous pouvez supprimer votre compte à tout moment sur la page Compte ; cela résilie aussi votre abonnement.",
        ],
      },
      {
        heading: "Modifications et droit applicable",
        paragraphs: [
          "Nous pouvons mettre à jour ces conditions. Pour les changements importants, nous vous prévenons par e-mail ou dans l'application avant leur entrée en vigueur.",
          "Le droit néerlandais s'applique et les litiges relèvent du tribunal compétent aux Pays-Bas. Si vous êtes consommateur, vous gardez la protection des règles impératives du pays où vous vivez.",
          "Des questions ou un problème ? Écrivez à twapza@gmail.com.",
        ],
      },
    ],
  },

  ar: {
    title: "شروط الخدمة",
    intro:
      "تنطبق هذه الشروط عند استخدامك Twapza (www.twapza.io)، وهي خدمة تُدار من هولندا. بإنشائك حسابًا فإنك توافق عليها. يُرجى قراءتها؛ فهي قصيرة.",
    sections: [
      {
        heading: "حسابك",
        paragraphs: [
          "يجب أن يكون عمرك 16 عامًا على الأقل وأن تقدّم بريدًا إلكترونيًا صالحًا. احتفظ بكلمة المرور لنفسك: أنت مسؤول عمّا يحدث في حسابك. حساب واحد لكل شخص.",
        ],
      },
      {
        heading: "فيديوهاتك",
        paragraphs: [
          "استخدم فقط الفيديوهات التي تملكها أو لديك إذن باستخدامها. تؤكد ذلك مع كل فيديو. تبقى لك جميع الحقوق في فيديوهاتك ومقاطعك.",
          "تسمح لـ Twapza بمعالجة فيديوهاتك فقط لتقديم الخدمة لك (إنشاء المعاينات والتفريغ النصي والمقاطع). يُحذف كل شيء تلقائيًا بعد 24 ساعة.",
          "أنت مسؤول عمّا تنشره، بما في ذلك الإشارة إلى صنّاع المحتوى الآخرين واتباع قواعد يوتيوب وتيك توك وغيرها من المنصات.",
        ],
      },
      {
        heading: "الاستخدام العادل",
        paragraphs: [
          "لا تستخدم Twapza لمحتوى غير قانوني أو محتوى ينتهك حقوق الآخرين أو لإيذاء أي شخص. لا تحاول تعطيل الخدمة أو إثقالها أو تجاوز حدودها، ولا تُعِد بيع الوصول إليها.",
          "يجوز لنا تعليق أو إغلاق أي حساب يخالف هذه القواعد.",
        ],
      },
      {
        heading: "اقتراحات الذكاء الاصطناعي",
        paragraphs: [
          "تُنشأ أبرز اللحظات والترجمة والعناوين والأوصاف تلقائيًا وقد تحتوي على أخطاء. راجع مقاطعك قبل نشرها.",
        ],
      },
      {
        heading: "الخطط والمدفوعات",
        paragraphs: [
          "يقدّم Twapza خطة مجانية وخططًا مدفوعة (Creator وPro) بفوترة شهرية أو سنوية. تظهر محتويات كل خطة في صفحة الأسعار.",
          "تعالج Stripe المدفوعات، وتبيع الاشتراك بصفتها البائع المسجّل (merchant of record) وتضيف ضريبة القيمة المضافة أو ضريبة المبيعات حيث تنطبق. تنطبق شروط Stripe أيضًا على عملية الدفع.",
          "تتجدد الاشتراكات تلقائيًا حتى تلغيها. يمكنك الإلغاء في أي وقت من صفحة حسابك (إدارة الاشتراك)؛ وتبقى خطتك فعّالة حتى نهاية الفترة المدفوعة. لا تُرحَّل الدقائق غير المستخدمة. عند تغيير الخطة يُحتسب فرق السعر بالتناسب.",
        ],
      },
      {
        heading: "الاسترداد",
        paragraphs: [
          "لا تُسترد مدفوعات فترة بدأت بالفعل، إلا إذا اشترط القانون ذلك.",
          "إذا كنت تعيش في الاتحاد الأوروبي، يمكنك العدول عن أول عملية شراء خلال 14 يومًا. ولأنك تطلب بدء الخدمة فورًا، فقد يتعين عليك دفع مقابل الجزء الذي استخدمته. للعدول راسلنا على twapza@gmail.com.",
        ],
      },
      {
        heading: "الخدمة",
        paragraphs: [
          "نبذل جهدنا لإبقاء Twapza قيد التشغيل، لكن لا يمكننا أن نعد بأنها متاحة دائمًا أو خالية من الأخطاء. قد نحسّن الميزات أو نغيّرها؛ وإذا أثّر تغيير بشكل كبير على خطة مدفوعة فسنبلغك مسبقًا.",
        ],
      },
      {
        heading: "المسؤولية",
        paragraphs: [
          "تُقدَّم Twapza كما هي. تقتصر مسؤوليتنا الإجمالية على المبلغ الذي دفعته لنا خلال الأشهر الاثني عشر السابقة للضرر. لسنا مسؤولين عن الأضرار غير المباشرة مثل المشاهدات أو الدخل الضائع. لا شيء في هذه الشروط يقيّد مسؤولية لا يجيز القانون تقييدها، ولا حقوقك كمستهلك.",
        ],
      },
      {
        heading: "إنهاء الاستخدام",
        paragraphs: [
          "يمكنك حذف حسابك في أي وقت من صفحة الحساب؛ وهذا يلغي اشتراكك أيضًا.",
        ],
      },
      {
        heading: "التغييرات والقانون المطبّق",
        paragraphs: [
          "قد نحدّث هذه الشروط. عند التغييرات المهمة نبلغك بالبريد الإلكتروني أو داخل التطبيق قبل سريانها.",
          "يُطبَّق القانون الهولندي، وتُحال النزاعات إلى المحكمة المختصة في هولندا. إذا كنت مستهلكًا، تحتفظ بحماية القواعد الإلزامية في البلد الذي تعيش فيه.",
          "لديك أسئلة أو مشكلة؟ راسلنا على twapza@gmail.com.",
        ],
      },
    ],
  },
};
