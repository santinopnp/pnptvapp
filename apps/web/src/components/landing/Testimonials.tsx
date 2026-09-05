import React from "react";

interface TestimonialsProps {
  lang: "en" | "es" | string;
}

const copy = {
  en: {
    eyebrow: "//members",
    heading: "What members say",
    quotes: [
      {
        text: "Finally a space that gets us. Not another sanitized dating app.",
        name: "Alex",
        age: 32,
        city: "Mexico City",
        initial: "A",
        color: "#D4007A",
      },
      {
        text: "The Main Stage is next-level. It's like a queer party 24/7.",
        name: "Diego",
        age: 28,
        city: "Bogotá",
        initial: "D",
        color: "#7B61FF",
      },
      {
        text: "I love that creators actually make bank here. Real earnings, real community.",
        name: "Marco",
        age: 35,
        city: "Madrid",
        initial: "M",
        color: "#E69138",
      },
    ],
  },
  es: {
    eyebrow: "//miembros",
    heading: "Lo que dicen los miembros",
    quotes: [
      {
        text: "Por fin un espacio que nos entiende. No otra app de citas sin chiste.",
        name: "Alex",
        age: 32,
        city: "Ciudad de México",
        initial: "A",
        color: "#D4007A",
      },
      {
        text: "El Main Stage es otro nivel. Es como una fiesta queer 24/7.",
        name: "Diego",
        age: 28,
        city: "Bogotá",
        initial: "D",
        color: "#7B61FF",
      },
      {
        text: "Me encanta que los creadores de verdad ganan aquí. Ingresos reales, comunidad real.",
        name: "Marco",
        age: 35,
        city: "Madrid",
        initial: "M",
        color: "#E69138",
      },
    ],
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

export function Testimonials({ lang }: TestimonialsProps) {
  const c = pick(lang);

  return (
    <section
      aria-labelledby="testimonials-heading"
      className="w-full px-4 py-16 sm:px-6 lg:px-8"
      style={{ background: "#0A0A0F" }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] mb-3"
            style={{ fontFamily: "'Roboto Mono', monospace", color: "#A1A1A3" }}
          >
            {c.eyebrow}
          </p>
          <h2
            id="testimonials-heading"
            className="text-2xl sm:text-3xl font-bold text-white"
            style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
          >
            {c.heading}
          </h2>
        </div>

        {/* Quote grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {c.quotes.map((q) => (
            <QuoteCard key={q.name} quote={q} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface Quote {
  text: string;
  name: string;
  age: number;
  city: string;
  initial: string;
  color: string;
}

interface QuoteCardProps {
  quote: Quote;
}

function QuoteCard({ quote }: QuoteCardProps) {
  return (
    <figure
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{
        background: "#151518",
        border: "1px solid #252525",
      }}
    >
      {/* Big quote mark */}
      <div
        aria-hidden="true"
        className="text-5xl leading-none font-serif select-none"
        style={{ color: quote.color, opacity: 0.4, lineHeight: 1, marginBottom: -8 }}
      >
        &ldquo;
      </div>

      {/* Quote text */}
      <blockquote className="flex-1">
        <p
          className="text-sm sm:text-base text-white leading-relaxed italic"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          {quote.text}
        </p>
      </blockquote>

      {/* Attribution */}
      <figcaption className="flex items-center gap-3 mt-auto pt-2 border-t border-pnp-border">
        {/* Initial avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: `${quote.color}22`, border: `1px solid ${quote.color}44`, color: quote.color }}
          aria-hidden="true"
        >
          {quote.initial}
        </div>
        <div className="min-w-0">
          <p
            className="text-xs font-bold text-white"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            {quote.name}, {quote.age}
          </p>
          <p
            className="text-[10px]"
            style={{ color: "#A1A1A3", fontFamily: "'Roboto Mono', monospace" }}
          >
            {quote.city}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
