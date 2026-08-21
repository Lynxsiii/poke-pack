/** Avatar ring colors — type-palette stills. Custom fills stay premium later. */
export const AVATAR_COLORS = [
  { id: "gold", hex: "#f0c14b", label: "Pikachu" },
  { id: "thunder", hex: "#ffe566", label: "Jolteon" },
  { id: "ember", hex: "#ff7a3d", label: "Charizard" },
  { id: "flame", hex: "#e23d2e", label: "Blaziken" },
  { id: "rose", hex: "#ff5fa2", label: "Sylveon" },
  { id: "fairy", hex: "#ffb7d5", label: "Gardevoir" },
  { id: "violet", hex: "#9b6dff", label: "Mewtwo" },
  { id: "poison", hex: "#b84ad4", label: "Nidoking" },
  { id: "ghost", hex: "#6b5b95", label: "Gengar" },
  { id: "night", hex: "#4a3f5c", label: "Umbreon" },
  { id: "aqua", hex: "#5fd4ff", label: "Squirtle" },
  { id: "ocean", hex: "#2f6dff", label: "Greninja" },
  { id: "ice", hex: "#b8f0ff", label: "Articuno" },
  { id: "lime", hex: "#66e08a", label: "Bulbasaur" },
  { id: "forest", hex: "#2f9e4a", label: "Sceptile" },
  { id: "bug", hex: "#a8c94a", label: "Scyther" },
  { id: "dragon", hex: "#4b6cff", label: "Dragonite" },
  { id: "steel", hex: "#c5d0dc", label: "Metagross" },
  { id: "earth", hex: "#c48a4b", label: "Groudon" },
  { id: "rock", hex: "#b89a6a", label: "Onix" },
];

export const COLOR_IDS = new Set(AVATAR_COLORS.map((c) => c.id));

export function avatarColor(id) {
  return AVATAR_COLORS.find((c) => c.id === id) || AVATAR_COLORS[0];
}
