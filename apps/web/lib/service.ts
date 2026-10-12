import { useQuery } from "@tanstack/react-query";
import type { ServiceInfo } from "@blindpass/shared";
import { browserClient } from "./vault";

export function useService() {
  return useQuery({
    queryKey: ["service"],
    queryFn: () => browserClient().request<ServiceInfo>("/api/service"),
  });
}
