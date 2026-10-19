import JSZip from "jszip";
import { expect, it } from "vitest";

import { playlistArchiveName } from "./download";

it("keeps every playlist when names repeat or sanitise to the same filename", async () => {
  const zip = new JSZip();
  const names = ["Mix", "Mix", "Mix (2)", "A/B", "A:B"];
  for (const [index, name] of names.entries()) {
    zip.file(playlistArchiveName(name, (candidate) => zip.file(candidate) !== null), String(index));
  }
  const archive = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
  const files = Object.values(archive.files);
  expect(files).toHaveLength(names.length);
  expect(await Promise.all(files.map((file) => file.async("string")))).toEqual(["0", "1", "2", "3", "4"]);
});
