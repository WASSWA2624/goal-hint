import { Container, PageHeading, PageMain, Stack, BodyText } from "@/components/ui/layout";
import { BrandLogo, BrandMark } from "@/components/ui/brand";
import { PrimitiveDemo } from "./primitive-demo";
import { verifyPrivateBoundary } from "./private-boundary";
export default function Page() {
  verifyPrivateBoundary();
  return <PageMain id="acceptance-main" tabIndex={-1}><Container><Stack $gap="lg">
    <BrandLogo /><BrandMark />
    <PageHeading>Brand styling acceptance fixture</PageHeading>
    <BodyText>These are synthetic interface checks. No football fixtures or predictions are represented.</BodyText>
    <PrimitiveDemo />
  </Stack></Container></PageMain>;
}

