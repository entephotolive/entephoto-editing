"use client";

import PhotoEditor from "@/components/PhotoEditor";

export default function Home() {
  return (
    <PhotoEditor
      imageUrl="/sample.JPG"
      onClose={() => console.log("Editor closed")}
    />
  );
}