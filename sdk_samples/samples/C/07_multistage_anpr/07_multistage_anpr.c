/**
 * CARMEN Video SDK
 *
 * @category    C Sample
 * @package     CARMEN Video C Sample
 *
 * @copyright   2024 Adaptive Recognition
 * @licence     https://adaptiverecognition.com/eula/
 *
 *
 * This sample shows how you can set up a process with CARMEN Video SDK that
 * uses multistage ANPR.
 */

#include <stdio.h>
#include <string.h>

#include "utils.h"

#include <carmen/Event.h>
#include <carmen/AnprBuilder.h>
#include <carmen/MmrBuilder.h>
#include <carmen/StreamProcessorBuilder.h>
#include <carmen/CmError.h>
#include "carmen/Logger.h"


void onEventCallback(CM_EVENT* e, void* userdata) {
    printf("------------------------------------------------------\n");
    printf("Plate text: %s\n", e->vehicle->plate->text);
    printf("Country: %s\n", e->vehicle->plate->country);

    if(e->vehicle->mmrData && e->vehicle->mmrData->make) {
        printf("MMR Make: %s\n", e->vehicle->mmrData->make);
    }

    printf("\n");
    fflush(stdout);
    cm_event_free(e);
}

// may be omitted, the example only uses it for showing status changes
void onStatusChangeCallback(CM_STREAM_PROCESSOR handle, enum CM_StreamProcessorStatus status, void* userdata){
    commonStatusCallback(handle, status);
};



int multistage_cb(const CM_ANPR_MULTISTAGE_CALLBACK_INFO* info) {
    for (int i = 0; i < info->nstage; ++i) {
        printf("%d %s %d\n", i, info->stages[i].plateTextUtf8, info->stages[i].confidence);
    }

    int lastIndex = info->nstage-1;
    const CM_ANPR_MULTISTAGE_CALLBACK_STAGE_INFO* lastStage = &info->stages[lastIndex];
    if(lastStage->plateTextUtf8 && (lastStage->confidence > 80)) {
        return lastIndex;
    }
    if(!info->wasLastStage) {
        return -1;
    }

    int confidence_max = 0;
    int confidence_max_ix = -1;
    for(int i = 0; i < info->nstage; ++i) {
        const CM_ANPR_MULTISTAGE_CALLBACK_STAGE_INFO* curStage = &info->stages[i];
        if(!curStage->plateTextUtf8) {
            continue;
        }
        int cur_confidence = curStage->confidence;
        if(cur_confidence > confidence_max) {
            confidence_max = cur_confidence;
            confidence_max_ix = i;
        }
    }
    return confidence_max_ix;
}


int create_multistage_anpr_profile(CM_ANPR_PROFILE_ID* profileId, CM_ANPR anpr, const char* region1, const char* region2) {
    CM_ANPR_STAGE_PROPERTY properties[] = {
            {"recognitionmode", "1"}
    };

    CM_ANPR_STAGE stages[2] = {
            {region1, {0,0,0,0}, 0, {0, 0}}, // 0,0,0,0 version means latest
            {region2, {0,0,0,0}, 0, {properties, 1}}
    };
    return cm_anpr_register_profile(anpr, profileId, stages, 2, multistage_cb, NULL);
}


int add_anpr(CM_STREAM_PROCESSOR_BUILDER processor_builder, const char* region1, const char* region2) {
    CM_ANPR_BUILDER anprBuilder;
    memset(&anprBuilder, 0, sizeof(anprBuilder));
    cm_anprbuilder_create(&anprBuilder);

    CM_ANPR anpr;
    memset(&anpr, 0, sizeof(anpr));
    CHECK_CM_ERROR(cm_anprbuilder_build(anprBuilder, &anpr));
    cm_anprbuilder_free(anprBuilder);

    CM_ANPR_PROFILE_ID myMultiStageProfileId;
    CHECK_CM_ERROR(create_multistage_anpr_profile(&myMultiStageProfileId, anpr, region1, region2));
    cm_streamprocessorbuilder_set_anpr(processor_builder, anpr);
    cm_anpr_free(anpr); // unref
    cm_streamprocessorbuilder_set_anpr_profile_id(processor_builder, myMultiStageProfileId);
    return 0;
}


int add_mmr(CM_STREAM_PROCESSOR_BUILDER processor_builder, const char* mmrGroupName) {
    CM_MMR_BUILDER mmr_builder;
    cm_mmrbuilder_create(&mmr_builder);
    CM_MMR mmr;
    cm_mmrbuilder_build(mmr_builder, &mmr);
    cm_mmrbuilder_free(mmr_builder);

    CM_MMR_PROFILE_ID mmr_profile_id;
    CM_MMR_PROFILE mmr_profile;
    memset(&mmr_profile, 0, sizeof(mmr_profile));
    mmr_profile.groupName = mmrGroupName;
    unsigned int version[4] = {0, 0, 0, 0}; // latest
    memcpy(&mmr_profile.version, version, sizeof(version));
    cm_mmr_register_profile(mmr, &mmr_profile_id, &mmr_profile);
    cm_streamprocessorbuilder_set_mmr(processor_builder, mmr);
    cm_mmr_free(mmr); // unref
    cm_streamprocessorbuilder_set_mmr_profile_id(processor_builder, mmr_profile_id);
    return 0;
}


int init_streamprocessor_builder(
        CM_STREAM_PROCESSOR_BUILDER* builder,
        const char* streamUrl,
        const char* region1,
        const char* region2,
        const char* mmrRegion) {
    memset(builder, 0, sizeof(*builder));
    cm_streamprocessorbuilder_create(builder);

    cm_streamprocessorbuilder_set_source(*builder, streamUrl);
    cm_streamprocessorbuilder_set_name(*builder, "Stream 1");
    cm_streamprocessorbuilder_set_event_callback(*builder, onEventCallback, NULL, NULL);
    cm_streamprocessorbuilder_set_status_change_callback(*builder, onStatusChangeCallback, NULL, NULL);
    if(add_anpr(*builder, region1, region2) < 0) {
        return -1;
    }
    if(mmrRegion && mmrRegion[0]) {
        add_mmr(*builder, mmrRegion);
    }
    return 0;
}

int main(int argc, char** argv) {
//    cm_logger_set_global_logger_min_level(CM_LOGGER_LEVEL_DEBUG);

    if(argc < 4) {
        printf("Usage: %s <region code 1st> <region code 2nd> <stream url / video file> [mmr-region]\n", argv[0]);

        //  Region code:
        //      See in Reference Manual: Region List
        //      For "mmr-region" you have to include the "mmr-" prefix like it appears in gxsd.dat (e.g.: "mmr-eur")
        //
        //  Stream url examples:
        //      "rtsp://username:password@192.168.1.2:8994"
        //      "http://192.168.1.2:9901/video.mjpeg"
        //  Video file example:
        //      "file:///C:\\video.mp4"

        return -1;
    }

    const char* region1 = argv[1];
    const char* region2 = argv[2];
    const char* streamUrl = argv[3];
    const char* mmrRegion = NULL;
    if(argc >= 5) {
        mmrRegion = argv[4];
    }

    CM_STREAM_PROCESSOR_BUILDER builder;
    if(init_streamprocessor_builder(&builder, streamUrl, region1, region2, mmrRegion) < 0) {
        return -1;
    }

    CM_STREAM_PROCESSOR stream;
    memset(&stream, 0, sizeof(stream));
    CHECK_CM_ERROR(cm_streamprocessorbuilder_build(builder, &stream));
    cm_streamprocessorbuilder_free(builder);

    printf("Please press 'q' then 'Enter' to stop stream processing.\n");
    CHECK_CM_ERROR(cm_streamprocessor_start(stream));
    while(getc(stdin) != 'q');
    CHECK_CM_ERROR(cm_streamprocessor_stop(stream));
    cm_streamprocessor_free(stream);

    return 0;
}
