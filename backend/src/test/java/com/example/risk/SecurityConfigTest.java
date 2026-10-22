package com.example.risk;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://example.auth0.com/",
    "spring.security.oauth2.resourceserver.jwt.audiences=https://enterprise-risk-api"
})
@AutoConfigureMockMvc
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void rejectsUnauthenticatedRequests() throws Exception {
        mockMvc.perform(get("/api/risk-status"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void requiresRiskPermission() throws Exception {
        mockMvc.perform(get("/api/risk-status").with(jwt()))
            .andExpect(status().isForbidden());
    }

    @Test
    void allowsRequestsWithRiskPermission() throws Exception {
        mockMvc.perform(get("/api/risk-status").with(jwt().authorities(
                new SimpleGrantedAuthority("SCOPE_read:risk"))))
            .andExpect(status().isOk());
    }
}
