"use client";

import { useDispatch, useSelector } from "react-redux";
import type { DetailDispatch, DetailState } from "./detail-store";

export const useDetailDispatch = useDispatch.withTypes<DetailDispatch>();
export const useDetailSelector = useSelector.withTypes<DetailState>();
