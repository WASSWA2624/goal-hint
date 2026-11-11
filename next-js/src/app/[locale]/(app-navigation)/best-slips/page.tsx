import { createBestSlipsRoute } from "@/app/_components/best-slips-route";

const route = createBestSlipsRoute();
export const generateMetadata = route.generateMetadata;
export default route.Page;
