---
'@phylax-systems/phylax-rpc': patch
---

Clear the modal's previous connection result when its verification callback changes. Keep
the existing polling interval and use the latest callback for the next check, without
restarting requests on inline callback rerenders.
