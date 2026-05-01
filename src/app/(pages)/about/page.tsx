"use client";

import { usePageTitle } from "@/lib/page-context";

export default function AboutPage() {
  usePageTitle("About");

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-base font-semibold">About</h2>
      <p className="text-sm text-muted-foreground">
        data-dimensions — サービスごとに source → target のマッピングを管理し、
        外部公開するための dim 層管理アプリ。
      </p>
      <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-5">
        <li>各サービス内で、自分で定義したカテゴリ (target) と外部 raw (source) をマッピング</li>
        <li>確定したマッピングを bitemporal append-only で保持</li>
        <li>マッピング結果は HTTP API で外部公開</li>
      </ul>
    </div>
  );
}
