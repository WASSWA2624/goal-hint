# Phone Builder polling fixture

Uses the production Slip Builder, observation provider, POST handler, slip cards
and sharing drawer with synthetic data and no database/provider calls. Default
viewer has eligible access. Cookie `fixture-polling-viewer=guest` withdraws access;
`fixture-polling-phase=scheduled|live|final` controls observations. New builds vary
the rendered cohort through the normal total-slip field and GET navigation.
There is no actual publication, member session or external share delivery.
