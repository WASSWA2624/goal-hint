export default async function Page({ params }: { params: Promise<{ fixtureId: string; slug: string }> }) {
  const { fixtureId, slug } = await params;
  return <main id="main-content"><h1>Synthetic match detail</h1><p>{fixtureId}: {slug}</p></main>;
}
