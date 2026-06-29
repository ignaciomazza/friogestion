import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearchText,
  rankProductsBySearchQuery,
  scoreProductSearchMatch,
} from "../src/lib/products-search";

const PRODUCTS = [
  {
    id: "p1",
    name: "Heladera No Frost 340L",
    sku: "HF-340",
    purchaseCode: "AB-123 45",
    brand: "FrioSur",
    model: "X1",
  },
  {
    id: "p2",
    name: "Cocina Industrial 4 Hornallas",
    sku: "CI-4H",
    purchaseCode: "COC-200",
    brand: "Catering Pro",
    model: "H4",
  },
  {
    id: "p3",
    name: "Motor Ñandú 1/2 HP",
    sku: "MN-12",
    purchaseCode: "MOT-12",
    brand: "Térmico",
    model: "N-12",
  },
  {
    id: "p4",
    name: "Marco Escotilla 218",
    sku: "218-300",
    purchaseCode: "X-218-3",
    brand: "Series",
    model: "M218",
  },
  {
    id: "p5",
    name: "Terminal Rotalock",
    sku: "000-000",
    purchaseCode: "R-000",
    brand: "FrioSur",
    model: "R0",
  },
  {
    id: "p6",
    name: "A.A LG ART COOL INVERTER",
    sku: "AA-123",
    purchaseCode: "LG-AC",
    brand: "LG",
    model: "AC-1",
  },
  {
    id: "p7",
    name: "Pesa Digital",
    sku: "KG-100",
    purchaseCode: "BAL-KG",
    brand: "Medir",
    model: "K-100",
  },
  {
    id: "p8",
    name: "1/4 FM X 14 MM HEMBRA ( P /MANGUERA R - 134 )",
    sku: "204-353",
    purchaseCode: "MANG-14",
    brand: "Acme",
    model: "R-134",
  },
  {
    id: "p9",
    name: "Canio para balanza",
    sku: "KG-001",
    purchaseCode: "CAN-1",
    brand: "Medir",
    model: "C-1",
  },
  {
    id: "p10",
    name: "A.A CANDY 2250 FRIO/CALOR INVERTER",
    sku: "213-130",
    purchaseCode: "AA-CAN",
    brand: "Candy",
    model: "A2250",
  },
];

test("normalizeSearchText normaliza tildes, simbolos y espacios", () => {
  assert.equal(
    normalizeSearchText("  HélaDéra---No   Fróst 340L  "),
    "heladera no frost 340l",
  );
  assert.equal(normalizeSearchText("Motor Ñandú"), "motor nandu");
});

test("rankProductsBySearchQuery es insensible a mayusculas/minusculas", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "HELADERA");
  assert.equal(ranked[0]?.id, "p1");
});

test("rankProductsBySearchQuery ignora tildes y simbolos", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "nandu termico");
  assert.equal(ranked[0]?.id, "p3");
});

test("rankProductsBySearchQuery encuentra codigos sin depender de separadores", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "ab12345");
  assert.equal(ranked[0]?.id, "p1");
});

test("scoreProductSearchMatch tolera errores de tipeo por proximidad", () => {
  const score = scoreProductSearchMatch(PRODUCTS[0], "heladra");
  assert.equal(typeof score, "number");
  assert.ok((score ?? 0) > 0);
});

test("rankProductsBySearchQuery evita fuzzy numerico en busquedas con guion", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "300-");
  assert.ok(ranked.some((product) => product.id === "p4"));
  assert.ok(!ranked.some((product) => product.id === "p5"));
});

test("rankProductsBySearchQuery exige match compacto para queries de codigo con separador", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "218-3");
  assert.ok(ranked.some((product) => product.id === "p4"));
  assert.ok(!ranked.some((product) => product.id === "p5"));
});

test("rankProductsBySearchQuery tolera proximidad en codigos numericos largos", () => {
  const ranked = rankProductsBySearchQuery(
    [
      {
        id: "near-code",
        name: "Relay compresor",
        sku: "2161",
        purchaseCode: null,
        brand: null,
        model: null,
      },
    ],
    "2160",
  );

  assert.equal(ranked[0]?.id, "near-code");
});

test("rankProductsBySearchQuery no aplica fuzzy numerico a codigos cortos", () => {
  const ranked = rankProductsBySearchQuery(
    [
      {
        id: "short-code",
        name: "Relay compresor",
        sku: "301",
        purchaseCode: null,
        brand: null,
        model: null,
      },
    ],
    "300",
  );

  assert.equal(ranked.length, 0);
});

test("rankProductsBySearchQuery no mezcla tokens cortos por fuzzy cuando hay separadores", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "kg-");
  assert.ok(ranked.some((product) => product.id === "p7"));
  assert.ok(!ranked.some((product) => product.id === "p6"));
});

test("rankProductsBySearchQuery no exige match de codigo cuando la query mezcla letras y fracciones", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "x 1/4");
  assert.ok(ranked.some((product) => product.id === "p8"));
});

test("rankProductsBySearchQuery encuentra fracciones aunque se busquen compactadas", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "x 14");
  assert.ok(ranked.some((product) => product.id === "p8"));
});

test("rankProductsBySearchQuery evita confundir canio con candy y prioriza token corto relevante", () => {
  const ranked = rankProductsBySearchQuery(PRODUCTS, "kg canio");
  assert.ok(ranked.some((product) => product.id === "p9"));
  assert.ok(!ranked.some((product) => product.id === "p10"));
});
