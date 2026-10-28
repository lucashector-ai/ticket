import "server-only";
import type { VenuePlace } from "@/lib/criar/model";

/* Google Places API (New): autocomplete de locais reais + detalhes do escolhido.
   A chave fica só no servidor (secret GOOGLE_PLACES_API_KEY no Cloudflare). Cada busca usa
   um sessionToken; quando a sessão termina num pedido de detalhes, o Google cobra só os detalhes. */

const API = "https://places.googleapis.com/v1";

export type PlaceHit = { placeId: string; name: string; addr: string };
export type PlaceDetails = { city: string; uf: string; place: VenuePlace };

export const placesEnabled = () => !!process.env.GOOGLE_PLACES_API_KEY;

const headers = (fieldMask?: string) => ({
  "content-type": "application/json",
  "x-goog-api-key": process.env.GOOGLE_PLACES_API_KEY ?? "",
  ...(fieldMask ? { "x-goog-fieldmask": fieldMask } : {}),
});
const noCountry = (s: string) => s.replace(/,\s*Brasil$|,\s*Brazil$/i, "").trim();

type Suggestion = { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } };

export async function autocompletePlaces(input: string, sessionToken: string): Promise<PlaceHit[]> {
  const res = await fetch(`${API}/places:autocomplete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ input, sessionToken, languageCode: "pt-BR", regionCode: "br", includedRegionCodes: ["br"] }),
  });
  if (!res.ok) throw new Error(`places autocomplete ${res.status}`);
  const data = (await res.json()) as { suggestions?: Suggestion[] };
  return (data.suggestions ?? []).flatMap(({ placePrediction: p }) => {
    if (!p) return [];
    const name = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
    return name ? [{ placeId: p.placeId, name, addr: noCountry(p.structuredFormat?.secondaryText?.text ?? "") }] : [];
  });
}

type Component = { longText: string; shortText: string; types: string[] };

/** Endereço, cidade, UF e coordenadas. Só campos "Essentials", a faixa mais barata do Place Details. */
export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails | null> {
  const qs = new URLSearchParams({ languageCode: "pt-BR", regionCode: "br", sessionToken });
  const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}?${qs}`, { headers: headers("id,formattedAddress,addressComponents,location") });
  if (!res.ok) throw new Error(`places details ${res.status}`);
  const p = (await res.json()) as { id: string; formattedAddress?: string; addressComponents?: Component[]; location?: { latitude: number; longitude: number } };
  const comp = (...types: string[]) => types.map((t) => p.addressComponents?.find((c) => c.types.includes(t))).find(Boolean);
  const city = comp("locality", "administrative_area_level_2")?.longText;
  const uf = comp("administrative_area_level_1")?.shortText;
  if (!city || !uf || !p.location) return null;
  const hood = comp("sublocality_level_1", "sublocality", "neighborhood")?.longText ?? null;
  return { city, uf: uf.toUpperCase().slice(0, 2), place: { id: p.id, addr: noCountry(p.formattedAddress ?? ""), hood, lat: p.location.latitude, lng: p.location.longitude } };
}
