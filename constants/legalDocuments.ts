export type LegalDocumentKey = "terms" | "privacy";

export type LegalDocumentSection = {
  heading: string;
  body: string;
};

export type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  subtitle: string;
  sections: LegalDocumentSection[];
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  terms: {
    key: "terms",
    title: "Kullanim Kosullari",
    subtitle:
      "Demo hesap olusturarak uygulamayi surus, rota planlama ve cihaz ici demo deneyimi amaciyla kullandiginizi kabul edersiniz.",
    sections: [
      {
        heading: "Hizmetin kapsami",
        body:
          "Uygulama rota planlama, AKBA sesli asistan deneyimi ve surus oturumu goruntuleme amaclariyla sunulur. Sunulan bilgi ve oneriler yardimci niteliktedir; surucu her durumda kendi dikkat ve kararindan sorumludur.",
      },
      {
        heading: "Kullanim sorumlulugu",
        body:
          "Surus sirasinda trafikteki isaret, kural ve fiili kosullar esas alinmalidir. Uygulamada gosterilen rota, sarj ve mola onerileri baglayici talimat degil, bilgilendirme niteligindedir.",
      },
      {
        heading: "Hesap kullanimi",
        body:
          "Demo hesap cihaz uzerinde tutulur. Telefon numaraniz dogrudan degil, hashlenmis bicimde saklanir. Hesabiniza ait bilgilerin dogru ve guncel olmasindan siz sorumlusunuz.",
      },
      {
        heading: "Icerik ve servis degisiklikleri",
        body:
          "Uygulama ozellikleri, desteklenen servisler ve arayuz unsurlari onceden bildirim yapilmaksizin guncellenebilir, duzenlenebilir veya kaldirilabilir.",
      },
      {
        heading: "Kabul",
        body:
          "Devam etmeden once bu kosullari okuyup anladiginizi ve uygulamayi bu cercevede kullanacaginizi beyan edersiniz.",
      },
    ],
  },
  privacy: {
    key: "privacy",
    title: "Aydinlatma Metni",
    subtitle:
      "Bu demo akista, hesap olusturma ve rota deneyimi icin islenen temel veriler hakkinda sizi bilgilendirir.",
    sections: [
      {
        heading: "Islenen veriler",
        body:
          "Ad, soyad, telefon numarasinin hashlenmis hali, secilen ilgi alanlari, kaydedilen rota oturumlari ve uygulama icindeki tercih bilgileriniz cihaz uzerinde islenebilir.",
      },
      {
        heading: "Isleme amaci",
        body:
          "Bu veriler demo hesap olusturma, size ozel rota ve mola onerileri sunma, onceki oturumlari goruntuleme ve uygulama deneyimini surdurme amaclariyla kullanilir.",
      },
      {
        heading: "Saklama sekli",
        body:
          "Bu demo surumde verileriniz cihaz ici veritabani uzerinde tutulur. Telefon numarasi dogrudan kaydedilmez; eslestirme icin hashlenmis bicimde saklanir.",
      },
      {
        heading: "Paylasim",
        body:
          "Bu akista kullanim kosullari ve aydinlatma metni uygulama icinde goruntulenir. Gereksiz dosya paylasimi veya disa aktarma varsayilan davranis degildir.",
      },
      {
        heading: "Haklariniz",
        body:
          "Profil bilgilerinizi uygulama icinden guncelleyebilir, oturumunuzu kapatabilir ve cihazdaki demo verilerinizin yonetimi konusunda kontrol sahibi olabilirsiniz.",
      },
    ],
  },
};
