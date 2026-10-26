const root = document.getElementById('app');
const params = new URLSearchParams(location.search);
if (params.has('flow')) {
  const { mountFlow } = await import('./flow.js');
  mountFlow(root, params.get('flow'), params.has('embed'));
} else {
  const { mountGallery } = await import('./gallery.js');
  mountGallery(root);
}
