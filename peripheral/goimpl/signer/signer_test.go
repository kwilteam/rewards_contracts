package signer_test

import (
	"context"
	"goimpl/signer"
	"testing"
	"time"

	"github.com/kwilteam/kwil-db/core/client"
	"github.com/stretchr/testify/require"
)

func TestSigner(t *testing.T) {
	ctx := context.Background()

	opts := getTestSignerOpts(t)

	clt, err := client.NewClient(ctx, "http://localhost:8484", opts)
	require.NoError(t, err)
	kwil := signer.NewKwilApi(clt, "y_rewards")

	s, err := signer.NewApp(kwil, "y_rewards", 0, *testPK, 30, signer.NewMemState())
	require.NoError(t, err)

	go s.Sync(ctx)

	time.Sleep(time.Minute * 5)
}
