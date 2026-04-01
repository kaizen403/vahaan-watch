project(c_sample_07_multistage_anpr)

add_executable(${PROJECT_NAME} 07_multistage_anpr.c)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
