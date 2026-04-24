import { fal } from "@fal-ai/client";
import fs from "fs";

fal.config({ credentials: process.env.FAL_API_KEY });

async function uploadToFal(localPath, filename) {
  const buffer = fs.readFileSync(localPath);
  const file = new File([buffer], filename, { type: "image/png" });
  const url = await fal.storage.upload(file);
  return url;
}

async function main() {
  const images = [
    { name: "shot1", local: "/home/ubuntu/fixture-review/shot1-v4.png" },
    { name: "shot2", local: "/home/ubuntu/fixture-review/shot2-v2.png" },
    { name: "shot3", local: "/home/ubuntu/fixture-review/shot3-v2.png" },
  ];

  for (const img of images) {
    if (!fs.existsSync(img.local)) {
      console.log("MISSING:", img.local);
      continue;
    }
    const url = await uploadToFal(img.local, img.name + ".png");
    console.log(img.name + ":", url);
  }
}

main().catch((e) => console.error(e));
