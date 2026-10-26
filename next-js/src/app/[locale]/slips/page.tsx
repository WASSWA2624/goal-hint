import { createSlipsRoute } from "@/app/_components/slips-route";

const route = createSlipsRoute();
export const generateMetadata = route.generateMetadata;
export default route.Page;
