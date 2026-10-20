const strings = {
  en: {
    // Face matching consent prompt (shown when an upload or go-live is blocked)
    faceMatchPromptTitle: "Face matching is needed to upload",
    faceMatchPromptBody: "To keep banned members out, we check faces in photos and videos against our ban list. Your facial data is used only for safety, never for marketing, and you can withdraw consent anytime in your privacy settings.",
    faceMatchPromptOptional: "This is optional. Without it you can still browse, chat and use the community — you just can't upload photos or videos or go live.",
    faceMatchAllow: "Allow face matching",
    faceMatchNotNow: "Not now",
    faceMatchAllowed: "Face matching is on. You can upload now — please try again.",
    faceMatchSaveError: "Couldn't save your choice. Please try again.",
    faceMatchReadPolicy: "Read the Privacy Policy",

    // Onboarding / settings checkbox
    faceMatchCheckbox: "I consent to face matching on my photos and videos for safety purposes. I understand this is optional and that without it I can't upload photos or videos or go live.",
    faceMatchOptionalTag: "Optional",
    onboardingScanningNote: "Safety scanning: PNPtv automatically scans posts, photos, videos and direct messages for illegal or dangerous content. No human reads your messages unless our system flags something or another member reports it.",

    // Privacy settings section
    faceMatchSettingsTitle: "Face matching",
    faceMatchSettingsOn: "On — you can upload photos and videos and go live.",
    faceMatchSettingsOff: "Off — photo and video uploads and going live are paused.",
    faceMatchTurnOn: "Turn on",
    faceMatchTurnOff: "Turn off",
    faceMatchTurnOffConfirm: "Turn off face matching? Your facial data will be deleted and photo/video uploads and going live will be paused until you turn it back on.",

    // Policy update modal (existing members)
    policyUpdateTitle: "We've updated our Terms and Privacy Policy",
    policyUpdateBody: "To keep the community safe, PNPtv now uses automated AI scanning on posts, photos, videos and direct messages. No human reads your messages unless our system flags something as potentially dangerous or illegal, or another member reports it.",
    policyUpdateFaceMatch: "We also offer optional face matching to keep banned members from coming back. You'll be asked separately before your next photo or video upload.",
    policyUpdateCheckbox: "I accept the updated Terms and Conditions and Privacy Policy.",
    policyUpdateAccept: "Accept and continue",
    policyUpdateSaving: "Saving…",
    policyUpdateTerms: "Terms and Conditions",
    policyUpdatePrivacy: "Privacy Policy",
    policyUpdateError: "Couldn't save. Please try again.",
  },
  es: {
    faceMatchPromptTitle: "Se necesita reconocimiento facial para subir",
    faceMatchPromptBody: "Para mantener fuera a los miembros baneados, comparamos los rostros de fotos y videos con nuestra lista de baneos. Tus datos faciales se usan solo por seguridad, nunca para marketing, y puedes revocar tu autorización cuando quieras en tu configuración de privacidad.",
    faceMatchPromptOptional: "Es opcional. Sin esta autorización puedes seguir navegando, chateando y usando la comunidad; solo no podrás subir fotos ni videos ni hacer transmisiones en vivo.",
    faceMatchAllow: "Autorizar reconocimiento facial",
    faceMatchNotNow: "Ahora no",
    faceMatchAllowed: "El reconocimiento facial está activado. Ya puedes subir; inténtalo de nuevo.",
    faceMatchSaveError: "No pudimos guardar tu elección. Inténtalo de nuevo.",
    faceMatchReadPolicy: "Leer la Política de Privacidad",

    faceMatchCheckbox: "Autorizo de manera previa, expresa e informada el uso de reconocimiento facial en mis fotos y videos con fines de seguridad. Entiendo que los datos biométricos son datos sensibles, que no estoy obligado a autorizar su tratamiento y que sin esta autorización no podré subir fotos ni videos ni hacer transmisiones en vivo.",
    faceMatchOptionalTag: "Opcional",
    onboardingScanningNote: "Análisis de seguridad: PNPtv analiza automáticamente publicaciones, fotos, videos y mensajes directos en busca de contenido ilegal o peligroso. Ninguna persona lee tus mensajes, salvo que nuestro sistema marque algo o que otro miembro lo reporte.",

    faceMatchSettingsTitle: "Reconocimiento facial",
    faceMatchSettingsOn: "Activado: puedes subir fotos y videos y transmitir en vivo.",
    faceMatchSettingsOff: "Desactivado: la subida de fotos y videos y las transmisiones en vivo están en pausa.",
    faceMatchTurnOn: "Activar",
    faceMatchTurnOff: "Desactivar",
    faceMatchTurnOffConfirm: "¿Desactivar el reconocimiento facial? Tus datos faciales se eliminarán y la subida de fotos/videos y las transmisiones en vivo quedarán en pausa hasta que lo vuelvas a activar.",

    policyUpdateTitle: "Actualizamos nuestros Términos y Política de Privacidad",
    policyUpdateBody: "Para mantener segura la comunidad, PNPtv ahora usa análisis automatizado con IA en publicaciones, fotos, videos y mensajes directos. Ninguna persona lee tus mensajes, salvo que nuestro sistema marque algo como potencialmente peligroso o ilegal, o que otro miembro lo reporte.",
    policyUpdateFaceMatch: "También ofrecemos reconocimiento facial opcional para evitar que los miembros baneados regresen. Te lo preguntaremos por separado antes de tu próxima subida de fotos o videos.",
    policyUpdateCheckbox: "Acepto los Términos y Condiciones y la Política de Privacidad actualizados.",
    policyUpdateAccept: "Aceptar y continuar",
    policyUpdateSaving: "Guardando…",
    policyUpdateTerms: "Términos y Condiciones",
    policyUpdatePrivacy: "Política de Privacidad",
    policyUpdateError: "No pudimos guardar. Inténtalo de nuevo.",
  },
} as const;

export type SafetyStrings = typeof strings.en;
export { strings as safety };
