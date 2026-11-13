import HomeworkChecker from "@/components/homework/HomeworkChecker";

export default function HomePage() {
  return (
    <main className="flex-1 bg-gradient-to-b from-indigo-50/70 via-slate-50 to-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <HomeworkChecker />
      </div>
    </main>
  );
}
